// Map trails on the server (docs/trails): saving a whole trail in one go, the review steps, and
// the trail's finishing reward. Stops are the brand's own pins, so collecting is untouched;
// the reward is a drop of its own whose only point is hidden from every map, so a finished run
// collects it like any pin and the wallet claim is the pin claim.

import { ItemPrivacy, Prisma, type Db } from "@wadzzo/db";
import { AppError, ErrorCodes } from "@wadzzo/errors";
import {
  estimateMinutes,
  pathMetres,
  trailBounds,
  type TrailSection,
} from "@wadzzo/geo/trail-geometry";
import {
  MAX_TRAILS_PER_BRAND,
  readStopDefaults,
  submitProblems,
  type SaveTrailInput,
  type TrailMode,
  type TrailStatus,
} from "@wadzzo/schemas/trail";

/** What every view of a trail reads: details, stops in order, path and reward. */
export const TRAIL_SELECT = {
  id: true,
  creatorId: true,
  platformId: true,
  title: true,
  description: true,
  coverImage: true,
  mode: true,
  order: true,
  color: true,
  path: true,
  distanceMetres: true,
  estMinutes: true,
  minLat: true,
  maxLat: true,
  minLng: true,
  maxLng: true,
  startDate: true,
  endDate: true,
  status: true,
  reviewNote: true,
  publishedAt: true,
  stopDefaults: true,
  rewardMinStops: true,
  createdAt: true,
  updatedAt: true,
  creator: { select: { id: true, name: true, profileUrl: true } },
  rewardGroup: {
    select: {
      id: true,
      limit: true,
      remaining: true,
      asset: { select: { id: true, name: true, code: true, thumbnail: true } },
    },
  },
  stops: {
    orderBy: { position: "asc" },
    select: {
      position: true,
      required: true,
      clue: true,
      locationGroup: {
        select: {
          id: true,
          title: true,
          image: true,
          latitude: true,
          longitude: true,
          endDate: true,
          approved: true,
          hidden: true,
          markerShape: true,
          pinShapeId: true,
          markerFill: true,
          markerColor: true,
          markerImageFit: true,
          markerAutoBadge: true,
          locations: { where: { hidden: false }, select: { id: true }, take: 1 },
        },
      },
    },
  },
  _count: { select: { runs: true } },
} satisfies Prisma.TrailSelect;

type Row = Prisma.TrailGetPayload<{ select: typeof TRAIL_SELECT }>;

/** The path as stored (one [lng, lat] line per section); anything unreadable reads as none. */
export function readPath(raw: unknown): TrailSection[] {
  if (!Array.isArray(raw)) return [];
  const ok = raw.every(
    (s) =>
      Array.isArray(s) &&
      s.every((p) => Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number"),
  );
  return ok ? (raw as TrailSection[]) : [];
}

/** A trail as the portal and the agent see it. */
export function toTrail(t: Row) {
  return {
    ...t,
    status: t.status as TrailStatus,
    mode: t.mode as TrailMode,
    path: readPath(t.path),
    stopDefaults: readStopDefaults(t.stopDefaults),
    runs: t._count.runs,
    stops: t.stops.map((s) => ({
      position: s.position,
      required: s.required,
      clue: s.clue,
      pin: {
        ...s.locationGroup,
        // the first visible point, for opening the pin
        locationId: s.locationGroup.locations[0]?.id ?? null,
      },
    })),
    reward: t.rewardGroup?.asset
      ? {
          asset: t.rewardGroup.asset,
          limit: t.rewardGroup.limit,
          remaining: t.rewardGroup.remaining,
          minStops: t.rewardMinStops,
        }
      : null,
  };
}
export type TrailView = ReturnType<typeof toTrail>;

/** Trails fans may see now: live, or published and an edit is in review. */
export function fanVisible(now = new Date()): Prisma.TrailWhereInput {
  return {
    hidden: false,
    startDate: { lte: now },
    endDate: { gte: now },
    OR: [{ status: "LIVE" }, { status: "PENDING", publishedAt: { not: null } }],
  };
}

/** Pins a trail may use: the brand's own live regular pins (not hotspot drops or rewards). */
async function checkStopPins(db: Db, creatorId: string, pinIds: string[]) {
  if (!pinIds.length) return new Map<string, { latitude: number; longitude: number }>();
  const pins = await db.locationGroup.findMany({
    where: { id: { in: pinIds } },
    select: {
      id: true,
      creatorId: true,
      hidden: true,
      hotspotId: true,
      latitude: true,
      longitude: true,
      title: true,
      rewardForTrail: { select: { id: true } },
    },
  });
  const byId = new Map(pins.map((p) => [p.id, p]));
  for (const id of pinIds) {
    const p = byId.get(id);
    if (p?.creatorId !== creatorId || p.hidden)
      throw new AppError(ErrorCodes.VALIDATION_FAILED, {
        message: "A stop isn't one of this brand's pins",
      });
    if (p.hotspotId)
      throw new AppError(ErrorCodes.VALIDATION_FAILED, {
        message: `"${p.title}" is a hotspot drop: those come and go, so they can't be stops`,
      });
    if (p.rewardForTrail)
      throw new AppError(ErrorCodes.VALIDATION_FAILED, {
        message: "A trail's reward can't be a stop",
      });
  }
  return byId;
}

/** Stops or path differ from what's saved: a live trail goes back to review. */
function routeChanged(
  before: { stops: { position: number; locationGroup: { id: string } }[]; path: unknown },
  input: SaveTrailInput,
) {
  const a = before.stops.map((s) => s.locationGroup.id).join(",");
  const b = input.stops.map((s) => s.pinId).join(",");
  return a !== b || JSON.stringify(readPath(before.path)) !== JSON.stringify(input.path);
}

export function trails(db: Db) {
  async function find(id: string) {
    const row = await db.trail.findUnique({ where: { id }, select: TRAIL_SELECT });
    if (!row) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Trail not found" });
    return row;
  }

  /**
   * Creates or updates the trail's reward drop. Its single point sits on the last stop and is
   * hidden, so it never shows on a map; it is collected only by `claimReward`.
   */
  async function syncReward(
    tx: Prisma.TransactionClient,
    trail: {
      id: string;
      creatorId: string;
      platformId: string;
      title: string;
      coverImage: string | null;
      startDate: Date;
      endDate: Date;
      rewardGroupId: string | null;
      live: boolean;
    },
    reward: SaveTrailInput["reward"],
    at: { latitude: number; longitude: number } | null,
  ) {
    if (!reward) {
      // Removing the reward ends it for new finishers; claims already made stay.
      if (trail.rewardGroupId)
        await tx.locationGroup.update({
          where: { id: trail.rewardGroupId },
          data: { hidden: true },
        });
      return null;
    }
    const asset = await tx.asset.findUnique({
      where: { id: reward.assetId },
      select: { id: true, creatorId: true },
    });
    if (asset?.creatorId !== trail.creatorId)
      throw new AppError(ErrorCodes.VALIDATION_FAILED, {
        message: "The reward must be one of the brand's own assets",
      });

    const place = at ?? { latitude: 0, longitude: 0 };
    const common = {
      title: `${trail.title} · finishing reward`,
      description: `For finishing the ${trail.title} trail`,
      image: trail.coverImage,
      startDate: trail.startDate,
      endDate: trail.endDate,
      latitude: place.latitude,
      longitude: place.longitude,
      assetId: asset.id,
      hidden: false,
    };

    if (trail.rewardGroupId) {
      const current = await tx.locationGroup.findUnique({
        where: { id: trail.rewardGroupId },
        select: {
          limit: true,
          remaining: true,
          assetId: true,
          locations: { select: { id: true } },
        },
      });
      if (current) {
        const claimed = current.limit - current.remaining;
        if (current.assetId !== asset.id && claimed > 0)
          throw new AppError(ErrorCodes.VALIDATION_FAILED, {
            message: "Fans have already claimed this reward, so its asset can't change",
          });
        await tx.locationGroup.update({
          where: { id: trail.rewardGroupId },
          data: {
            ...common,
            limit: reward.limit,
            remaining: Math.max(0, reward.limit - claimed),
            approved: trail.live ? true : null,
          },
        });
        await tx.location.updateMany({
          where: { locationGroupId: trail.rewardGroupId },
          data: { latitude: place.latitude, longitude: place.longitude, hidden: true },
        });
        return trail.rewardGroupId;
      }
    }

    const group = await tx.locationGroup.create({
      data: {
        ...common,
        creatorId: trail.creatorId,
        platformId: trail.platformId,
        privacy: ItemPrivacy.PUBLIC,
        radius: 0,
        limit: reward.limit,
        remaining: reward.limit,
        multiPin: false,
        approved: trail.live ? true : null,
        locations: {
          create: [
            {
              latitude: place.latitude,
              longitude: place.longitude,
              hidden: true,
              autoCollect: false,
            },
          ],
        },
      },
      select: { id: true },
    });
    return group.id;
  }

  return {
    find,

    async get(id: string) {
      return toTrail(await find(id));
    },

    async list(where: Prisma.TrailWhereInput) {
      const rows = await db.trail.findMany({
        where: { hidden: false, ...where },
        select: TRAIL_SELECT,
        orderBy: { updatedAt: "desc" },
        take: MAX_TRAILS_PER_BRAND,
      });
      return rows.map(toTrail);
    },

    /** Saves the whole trail (details, stops, path, defaults, reward) in one transaction. */
    async save(
      who: { creatorId: string; platformId: string },
      input: SaveTrailInput,
    ): Promise<TrailView> {
      const pins = await checkStopPins(
        db,
        who.creatorId,
        input.stops.map((s) => s.pinId),
      );
      const stopPoints = input.stops.map((s) => {
        const p = pins.get(s.pinId)!;
        return { lat: p.latitude, lng: p.longitude };
      });
      const metres = pathMetres(input.path);
      const bounds = trailBounds(stopPoints, input.path) ?? {
        minLat: 0,
        maxLat: 0,
        minLng: 0,
        maxLng: 0,
      };
      const last = input.stops.length
        ? pins.get(input.stops[input.stops.length - 1]!.pinId)!
        : null;

      const before = input.id ? await find(input.id) : null;
      if (before) {
        if (before.creatorId !== who.creatorId)
          throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Trail not found" });
        if (before.status === "ENDED")
          throw new AppError(ErrorCodes.VALIDATION_FAILED, {
            message: "An ended trail can't change",
          });
        if (input.updatedAt && before.updatedAt.getTime() > input.updatedAt.getTime() + 1)
          throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
            message: "Someone else saved this trail meanwhile. Reload it to see their changes.",
          });
      } else {
        const count = await db.trail.count({ where: { creatorId: who.creatorId, hidden: false } });
        if (count >= MAX_TRAILS_PER_BRAND)
          throw new AppError(ErrorCodes.VALIDATION_FAILED, {
            message: `A brand can keep up to ${MAX_TRAILS_PER_BRAND} trails`,
          });
      }

      // A live trail whose stops or path change goes back to review; fans keep seeing it.
      const status: TrailStatus =
        before?.status === "LIVE" && routeChanged(before, input)
          ? "PENDING"
          : ((before?.status as TrailStatus | undefined) ?? "DRAFT");

      const data = {
        title: input.title,
        description: input.description ?? null,
        coverImage: input.coverImage ?? null,
        mode: input.mode,
        order: input.order,
        color: input.color ?? null,
        path: input.path as Prisma.InputJsonValue,
        distanceMetres: metres,
        estMinutes: input.path.length ? estimateMinutes(metres, input.mode) : 0,
        ...bounds,
        startDate: input.startDate,
        endDate: input.endDate,
        status,
        stopDefaults: input.stopDefaults
          ? (input.stopDefaults as Prisma.InputJsonValue)
          : Prisma.DbNull,
        rewardMinStops: input.reward?.minStops ?? null,
      };

      const id = await db.$transaction(async (tx) => {
        const trail = before
          ? await tx.trail.update({ where: { id: before.id }, data, select: { id: true } })
          : await tx.trail.create({
              data: {
                ...data,
                creatorId: who.creatorId,
                platformId: who.platformId,
              },
              select: { id: true },
            });
        await tx.trailStop.deleteMany({ where: { trailId: trail.id } });
        if (input.stops.length)
          await tx.trailStop.createMany({
            data: input.stops.map((s, i) => ({
              trailId: trail.id,
              locationGroupId: s.pinId,
              position: i + 1,
              required: s.required,
              clue: s.clue?.trim() ? s.clue.trim() : null,
            })),
          });
        const rewardGroupId = await syncReward(
          tx,
          {
            id: trail.id,
            creatorId: who.creatorId,
            platformId: who.platformId,
            title: input.title,
            coverImage: input.coverImage ?? null,
            startDate: input.startDate,
            endDate: input.endDate,
            rewardGroupId: before?.rewardGroup?.id ?? null,
            live: status === "LIVE",
          },
          input.reward,
          last,
        );
        await tx.trail.update({
          where: { id: trail.id },
          data: { rewardGroupId: input.reward ? rewardGroupId : (before?.rewardGroup?.id ?? null) },
        });
        return trail.id;
      });
      return toTrail(await find(id));
    },

    /** Sends a draft (or a changed live trail) to review. */
    async submit(id: string) {
      const t = await find(id);
      if (t.status !== "DRAFT" && t.status !== "PENDING")
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: "Only a draft can be sent for review",
        });
      const problems = submitProblems({
        stops: t.stops,
        path: readPath(t.path),
        endDate: t.endDate,
      });
      if (problems.length)
        throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: problems.join(". ") });
      await db.trail.update({ where: { id }, data: { status: "PENDING", reviewNote: null } });
      return toTrail(await find(id));
    },

    async approve(id: string) {
      const t = await find(id);
      if (t.status !== "PENDING")
        throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "This trail isn't in review" });
      await db.$transaction([
        db.trail.update({
          where: { id },
          data: { status: "LIVE", reviewNote: null, publishedAt: t.publishedAt ?? new Date() },
        }),
        ...(t.rewardGroup
          ? [db.locationGroup.update({ where: { id: t.rewardGroup.id }, data: { approved: true } })]
          : []),
      ]);
      return toTrail(await find(id));
    },

    /** Back to the brand as a draft, with a note saying what to fix. */
    async reject(id: string, note: string) {
      const t = await find(id);
      if (t.status !== "PENDING")
        throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "This trail isn't in review" });
      await db.trail.update({ where: { id }, data: { status: "DRAFT", reviewNote: note } });
      return toTrail(await find(id));
    },

    /** Ends a trail: fans no longer see it; runs and claimed rewards stay. */
    async archive(id: string) {
      const t = await find(id);
      await db.$transaction([
        db.trail.update({ where: { id }, data: { status: "ENDED" } }),
        ...(t.rewardGroup
          ? [db.locationGroup.update({ where: { id: t.rewardGroup.id }, data: { hidden: true } })]
          : []),
      ]);
      return toTrail(await find(id));
    },

    /** Deletes a trail nobody has started (its stops stay: they are ordinary pins). */
    async remove(id: string) {
      const t = await find(id);
      if (t._count.runs > 0)
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: "Fans have started this trail: end it instead",
        });
      await db.$transaction([
        db.trail.delete({ where: { id } }),
        ...(t.rewardGroup
          ? [db.locationGroup.update({ where: { id: t.rewardGroup.id }, data: { hidden: true } })]
          : []),
      ]);
      return { id };
    },

    /** Started, finished, and how many runners collected each stop (where people drop off). */
    async stats(id: string) {
      const t = await find(id);
      const [started, finished, perStop] = await Promise.all([
        db.trailRun.count({ where: { trailId: id } }),
        db.trailRun.count({ where: { trailId: id, completedAt: { not: null } } }),
        Promise.all(
          t.stops.map((s) =>
            db.locationConsumer
              .findMany({
                where: {
                  location: { locationGroupId: s.locationGroup.id },
                  user: { trailRuns: { some: { trailId: id } } },
                },
                select: { userId: true },
                distinct: ["userId"],
              })
              .then((rows) => ({
                position: s.position,
                title: s.locationGroup.title,
                collected: rows.length,
              })),
          ),
        ),
      ]);
      const rewardsClaimed = t.rewardGroup ? t.rewardGroup.limit - t.rewardGroup.remaining : 0;
      return { started, finished, rewardsClaimed, stops: perStop };
    },
  };
}
