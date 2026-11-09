import type { Prisma } from "@wadzzo/db";
import { z } from "zod";

import { AppError, ErrorCodes } from "@wadzzo/errors";
import { isInPlatformScope, platformScope } from "@wadzzo/platform/scope";
import { orderLockReason, trailProgress } from "@wadzzo/schemas/trail";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../..";
import { fanVisible, readPath } from "../../brand/server/trails";
import { progressStops, recordTrailCollect } from "../server/trails";
import { writeClaimRow, WADZZO_ICON } from "./pins";

/**
 * ── Trails (docs/trails) ───────────────────────────────────────────────────
 *
 * A brand's ordered set of pins plus the path between them. Fans find trails near them, follow
 * one stop by stop (collecting each pin the usual way: AR, auto-collect or QR) and claim the
 * finishing reward. Progress is read from their collects; the order lock is enforced by
 * `pins.collect` / `pins.collectByQr` (assertClaimable), so this router only reports it.
 */

const SELECT = {
  id: true,
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
  platformId: true,
  rewardMinStops: true,
  creator: { select: { id: true, name: true, profileUrl: true } },
  rewardGroup: {
    select: {
      id: true,
      hidden: true,
      approved: true,
      limit: true,
      remaining: true,
      multiPin: true,
      asset: { select: { name: true, code: true, thumbnail: true } },
      locations: { select: { id: true }, take: 1 },
    },
  },
  stops: {
    orderBy: { position: "asc" },
    select: {
      position: true,
      required: true,
      clue: true,
      locationGroupId: true,
      locationGroup: {
        select: {
          title: true,
          image: true,
          optimizedImage: true,
          latitude: true,
          longitude: true,
          approved: true,
          hidden: true,
          endDate: true,
          locations: {
            where: { hidden: false },
            select: { id: true, latitude: true, longitude: true, autoCollect: true },
            take: 1,
          },
        },
      },
    },
  },
  _count: { select: { runs: true } },
} satisfies Prisma.TrailSelect;

type Row = Prisma.TrailGetPayload<{ select: typeof SELECT }>;
type Db = Parameters<typeof progressStops>[0];

/** A trail as the fan apps show it, with the viewer's progress (none when signed out). */
async function fanTrail(db: Db, row: Row, userId: string | null) {
  const stops = await progressStops(db, userId, row);
  const progress = trailProgress(stops, row.rewardMinStops);
  const run = userId
    ? await db.trailRun.findUnique({
        where: { userId_trailId: { userId, trailId: row.id } },
        select: { startedAt: true, completedAt: true, rewardConsumerId: true },
      })
    : null;
  const now = new Date();
  const reward = row.rewardGroup;
  const rewardLive = reward?.asset && !reward.hidden && reward.approved === true;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    coverImage: row.coverImage,
    mode: row.mode,
    order: row.order,
    color: row.color,
    path: readPath(row.path),
    distanceMetres: row.distanceMetres,
    estMinutes: row.estMinutes,
    bounds: { minLat: row.minLat, maxLat: row.maxLat, minLng: row.minLng, maxLng: row.maxLng },
    endDate: row.endDate.toISOString(),
    brand: {
      id: row.creator.id,
      name: row.creator.name,
      imageUrl: row.creator.profileUrl ?? WADZZO_ICON,
    },
    runners: row._count.runs,
    stops: row.stops.map((s) => {
      const g = s.locationGroup;
      const point = g.locations[0];
      const done = stops.find((p) => p.position === s.position)?.done ?? false;
      // A stop whose pin was taken down or ran out of time can't be collected any more.
      const gone = g.hidden || g.approved !== true || g.endDate < now || !point;
      return {
        position: s.position,
        required: s.required,
        clue: s.clue,
        title: g.title,
        imageUrl: g.optimizedImage ?? g.image ?? row.creator.profileUrl ?? WADZZO_ICON,
        /** The pin's id as the app uses it (a location), for AR capture and the pin card. */
        pinId: point?.id ?? null,
        lat: point?.latitude ?? g.latitude,
        lng: point?.longitude ?? g.longitude,
        autoCollect: point?.autoCollect ?? false,
        done,
        unavailable: !done && gone,
        lockReason: done ? null : orderLockReason(stops, s.position, row.order),
      };
    }),
    progress,
    run: run
      ? {
          startedAt: run.startedAt.toISOString(),
          completedAt: run.completedAt?.toISOString() ?? null,
        }
      : null,
    reward: rewardLive
      ? {
          name: reward.asset!.name,
          code: reward.asset!.code,
          thumbnail: reward.asset!.thumbnail,
          remaining: reward.remaining,
          limit: reward.limit,
          claimed: !!run?.rewardConsumerId,
          /** For "Claim to wallet" (claim.forPin) once claimed. */
          pinId: run?.rewardConsumerId ? (reward.locations[0]?.id ?? null) : null,
        }
      : null,
  };
}
export type FanTrail = Awaited<ReturnType<typeof fanTrail>>;

async function load(db: Db, ctx: { platform: { id: string; isRoot: boolean } }, id: string) {
  const row = await db.trail.findFirst({ where: { id, ...fanVisible() }, select: SELECT });
  if (!row || !isInPlatformScope(ctx, row.platformId))
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Trail not found" });
  return row;
}

export const trailsRouter = createTRPCRouter({
  /** Live trails within `radiusKm` of a point (or everywhere, without one), nearest first. */
  nearby: publicProcedure
    .input(
      z
        .object({
          lat: z.number().min(-90).max(90).optional(),
          lng: z.number().min(-180).max(180).optional(),
          radiusKm: z.number().positive().max(2000).default(50),
          brandId: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session?.user.id ?? null;
      const at =
        input?.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : null;
      const r = input?.radiusKm ?? 50;
      const dLat = r / 111.32;
      const dLng = at ? r / (111.32 * Math.max(Math.cos((at.lat * Math.PI) / 180), 0.01)) : 0;
      const rows = await ctx.db.trail.findMany({
        where: {
          ...fanVisible(),
          ...platformScope(ctx),
          ...(input?.brandId ? { creatorId: input.brandId } : {}),
          ...(at
            ? {
                minLat: { lte: at.lat + dLat },
                maxLat: { gte: at.lat - dLat },
                minLng: { lte: at.lng + dLng },
                maxLng: { gte: at.lng - dLng },
              }
            : {}),
        },
        select: SELECT,
        orderBy: { publishedAt: "desc" },
        take: 50,
      });
      const trails = await Promise.all(rows.map((row) => fanTrail(ctx.db, row, userId)));
      if (!at) return trails;
      const centre = (t: FanTrail) => ({
        lat: (t.bounds.minLat + t.bounds.maxLat) / 2,
        lng: (t.bounds.minLng + t.bounds.maxLng) / 2,
      });
      const d = (t: FanTrail) => {
        const c = centre(t);
        return (c.lat - at.lat) ** 2 + ((c.lng - at.lng) * Math.cos((at.lat * Math.PI) / 180)) ** 2;
      };
      return trails.sort((a, b) => d(a) - d(b));
    }),

  get: publicProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await load(ctx.db, ctx, input.id);
    return fanTrail(ctx.db, row, ctx.session?.user.id ?? null);
  }),

  /** The trails the viewer started, unfinished first. */
  mine: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const runs = await ctx.db.trailRun.findMany({
      where: { userId, trail: { hidden: false, ...platformScope(ctx) } },
      select: { trail: { select: SELECT } },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
    const trails = await Promise.all(runs.map((r) => fanTrail(ctx.db, r.trail, userId)));
    return trails.sort((a, b) => Number(a.progress.complete) - Number(b.progress.complete));
  }),

  /** "Start trail": opens the fan's run (collecting any stop starts it too). */
  start: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const row = await load(ctx.db, ctx, input.id);
      await ctx.db.trailRun.upsert({
        where: { userId_trailId: { userId, trailId: row.id } },
        create: { userId, trailId: row.id, platformId: ctx.platform.id },
        update: {},
      });
      // Stops collected before starting count straight away (and may finish it).
      const first = row.stops[0];
      if (first) await recordTrailCollect(ctx.db, userId, first.locationGroupId, ctx.platform.id);
      return fanTrail(ctx.db, row, userId);
    }),

  /**
   * The finishing reward: collects the trail's reward drop for the fan, once. From there it is
   * a collected pin, so "Claim to wallet" (claim.forPin / prepare) delivers it.
   */
  claimReward: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const row = await load(ctx.db, ctx, input.id);
      const reward = row.rewardGroup;
      const point = reward?.locations[0];
      if (!reward?.asset || reward.hidden || reward.approved !== true || !point)
        throw new AppError(ErrorCodes.ITEM_NOT_AVAILABLE, {
          message: "This trail has no reward to claim",
        });

      const stops = await progressStops(ctx.db, userId, row);
      if (!trailProgress(stops, row.rewardMinStops).complete)
        throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
          message: "Finish the trail to claim its reward",
        });

      const run = await ctx.db.trailRun.upsert({
        where: { userId_trailId: { userId, trailId: row.id } },
        create: { userId, trailId: row.id, platformId: ctx.platform.id, completedAt: new Date() },
        update: {},
        select: { id: true, completedAt: true, rewardConsumerId: true },
      });
      if (run.rewardConsumerId)
        throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
          message: "You've already claimed this reward",
        });

      // Takes one from the reward's stock and writes the collect (refuses a second one).
      const claim = await writeClaimRow(
        ctx.db,
        userId,
        point,
        { id: reward.id, multiPin: reward.multiPin, remaining: reward.remaining },
        ctx.platform.id,
      );
      await ctx.db.trailRun.update({
        where: { id: run.id },
        data: { rewardConsumerId: claim.id, completedAt: run.completedAt ?? new Date() },
      });
      return { pinId: point.id, redeemCode: claim.redeemCode };
    }),
});
