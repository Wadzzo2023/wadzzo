// Map trails for fans (docs/trails): progress, the order lock and runs. Progress is never
// stored, it is read from the fan's collects, so it can't drift; a run only records when the
// fan started, finished and claimed the reward.

import type { Db, Prisma } from "@wadzzo/db";
import { AppError, ErrorCodes } from "@wadzzo/errors";
import { orderLockReason, trailProgress, type ProgressStop } from "@wadzzo/schemas/trail";

import { fanVisible } from "../../brand/server/trails";

/**
 * Pins on a trail that isn't approved yet stay off the fan apps (docs/trails): a pin that is a
 * stop of a draft or in-review trail is hidden, unless it is also a stop of a trail fans can
 * already see (so a draft never pulls a pin out of a live trail). Stops of ended trails are
 * ordinary pins again. Spread into a LocationGroup filter; it sets only `OR`.
 */
export function trailApprovalGate(now = new Date()) {
  return {
    OR: [
      {
        trailStops: {
          none: {
            trail: {
              hidden: false,
              OR: [{ status: "DRAFT" }, { status: "PENDING", publishedAt: null }],
            },
          },
        },
      },
      { trailStops: { some: { trail: fanVisible(now) } } },
    ],
  } satisfies Prisma.LocationGroupWhereInput;
}

/** Whether a pin is held back because its only trails aren't approved yet. */
export async function hiddenByTrail(db: Db, groupId: string) {
  const shown = await db.locationGroup.findFirst({
    where: { id: groupId, ...trailApprovalGate() },
    select: { id: true },
  });
  return !shown;
}

type TrailForProgress = {
  id: string;
  order: string;
  rewardMinStops: number | null;
  stops: { position: number; required: boolean; locationGroupId: string }[];
};

/** Which of `groupIds` the user has collected (any point of the drop). */
async function collectedGroups(db: Db, userId: string, groupIds: string[]) {
  if (!groupIds.length) return new Set<string>();
  const rows = await db.locationConsumer.findMany({
    where: { userId, location: { locationGroupId: { in: groupIds } } },
    select: { location: { select: { locationGroupId: true } } },
  });
  return new Set(rows.map((r) => r.location.locationGroupId).filter((id): id is string => !!id));
}

/** Each stop with whether the user collected it. */
export async function progressStops(
  db: Db,
  userId: string | null,
  trail: TrailForProgress,
): Promise<(ProgressStop & { locationGroupId: string })[]> {
  const done = userId
    ? await collectedGroups(
        db,
        userId,
        trail.stops.map((s) => s.locationGroupId),
      )
    : new Set<string>();
  return trail.stops.map((s) => ({
    position: s.position,
    required: s.required,
    locationGroupId: s.locationGroupId,
    done: done.has(s.locationGroupId),
  }));
}

const STOPS_FOR_PROGRESS = {
  id: true,
  title: true,
  order: true,
  rewardMinStops: true,
  stops: {
    orderBy: { position: "asc" as const },
    select: { position: true, required: true, locationGroupId: true },
  },
};

/** The fan-visible trails a drop is a stop on. */
function trailsWithStop(db: Db, groupId: string) {
  return db.trail.findMany({
    where: { ...fanVisible(), stops: { some: { locationGroupId: groupId } } },
    select: STOPS_FOR_PROGRESS,
  });
}

/**
 * Throws when an ordered trail needs an earlier stop first. Runs inside `assertClaimable`, so
 * AR capture, auto-collect and QR (web and mobile) all obey it.
 */
export async function assertTrailOrder(db: Db, userId: string, groupId: string) {
  const list = await trailsWithStop(db, groupId);
  for (const t of list) {
    if (t.order !== "ORDERED") continue;
    const stops = await progressStops(db, userId, t);
    const position = stops.find((s) => s.locationGroupId === groupId)?.position;
    if (position == null) continue;
    const reason = orderLockReason(stops, position, t.order);
    if (reason) {
      const missing = stops.find((s) => s.required && !s.done && s.position < position);
      const name = missing
        ? await db.locationGroup
            .findUnique({ where: { id: missing.locationGroupId }, select: { title: true } })
            .then((g) => g?.title)
        : null;
      throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
        message: `${reason}${name ? ` (${name})` : ""} on “${t.title}”`,
      });
    }
  }
}

/**
 * After a collect: start the fan's run on every trail the drop is a stop on (collecting a stop
 * starts its trail), and mark it finished once enough stops are in. Best effort: never fails
 * the collect.
 */
export async function recordTrailCollect(
  db: Db,
  userId: string,
  groupId: string,
  platformId: string,
) {
  try {
    const list = await trailsWithStop(db, groupId);
    for (const t of list) {
      const stops = await progressStops(db, userId, t);
      const p = trailProgress(stops, t.rewardMinStops);
      const run = await db.trailRun.upsert({
        where: { userId_trailId: { userId, trailId: t.id } },
        create: { userId, trailId: t.id, platformId },
        update: {},
        select: { id: true, completedAt: true },
      });
      if (p.complete && !run.completedAt)
        await db.trailRun.update({ where: { id: run.id }, data: { completedAt: new Date() } });
    }
  } catch (err) {
    console.error("[trails] recording a collect failed", err);
  }
}
