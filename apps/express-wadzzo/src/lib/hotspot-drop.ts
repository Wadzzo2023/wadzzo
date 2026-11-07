/**
 * src/lib/hotspot-drop.ts
 *
 * Hotspot drops, done from the database alone. The worker's `hotspot_drop` job calls
 * `dropDueHotspots` every few minutes: it looks at each active hotspot, asks `hotspotAction`
 * (packages/geo) what is due, and does it. Nothing is kept in memory, so a restart, or a worker
 * that was down for an hour, simply catches up on the next look.
 */

import type { PrismaClient } from "@prisma/client";
import { generateRandomLocations } from "@wadzzo/geo";
import {
  START_TOLERANCE_MS,
  hotspotAction,
  isPendingFirstDrop,
} from "@wadzzo/geo/hotspot-schedule";
import { logger } from "./logger";
import type * as GeoJSON from "geojson";

export { isPendingFirstDrop };

// ─── Return shapes ────────────────────────────────────────────────────────────

export type DropResult =
  { skipped: true; reason?: string } | { expired: true } | { droppedAt: string; count: number };

async function findPendingFirstDrop(prisma: PrismaClient, hotspotId: string) {
  const hidden = await prisma.locationGroup.findMany({
    where: { hotspotId, hidden: true },
    select: {
      id: true,
      hidden: true,
      startDate: true,
      createdAt: true,
      _count: { select: { locations: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return hidden.find(isPendingFirstDrop) ?? null;
}

// ─── Core drop function ───────────────────────────────────────────────────────

/**
 * Executes one pin drop for the given hotspot (the caller decided it is due).
 *
 * Flow:
 *  1. Fetch hotspot — bail if not found or inactive
 *  2. Check end date — if expired, mark inactive and return { expired: true }
 *  3. Read most-recent LocationGroup for content metadata
 *  4. Generate fresh random pin coordinates inside the hotspot shape
 *  5. Write a new LocationGroup + Locations to DB
 *
 * @param prisma  Prisma client instance
 * @param hotspotId  The hotspot to drop for
 */
export async function dropPinsForHotspot(
  prisma: PrismaClient,
  hotspotId: string,
  /** `force` skips the one-drop-per-cycle guard (the worker's look has already checked the slot). */
  options: { force?: boolean; now?: Date } = {},
): Promise<DropResult> {
  // ── Step 1: Load hotspot ───────────────────────────────────────────────────
  const hotspot = await prisma.hotspot.findUnique({
    where: { id: hotspotId },
  });

  if (!hotspot) {
    logger.warn(`[hotspot-drop] Hotspot not found: ${hotspotId}`);
    return { skipped: true, reason: "hotspot not found" };
  }

  if (!hotspot.isActive) {
    logger.info(`[hotspot-drop] Hotspot inactive, skipping: ${hotspotId}`);
    return { skipped: true, reason: "hotspot inactive" };
  }

  const now = options.now ?? new Date();

  // ── Step 2: Check expiry ───────────────────────────────────────────────────
  if (now > new Date(hotspot.hotspotEndDate)) {
    logger.info(`[hotspot-drop] Hotspot expired: ${hotspotId}`);
    await prisma.hotspot.update({
      where: { id: hotspotId },
      data: { isActive: false },
    });
    return { expired: true };
  }

  // ── Step 2b: Not started yet ───────────────────────────────────────────────
  const startAt = new Date(hotspot.hotspotStartDate);
  if (now.getTime() < startAt.getTime() - START_TOLERANCE_MS) {
    return { skipped: true, reason: "hotspot has not started yet" };
  }

  // ── Step 2c: Reveal the first drop created ahead of the start date ─────────
  const pending = await findPendingFirstDrop(prisma, hotspotId);
  if (pending) {
    await prisma.locationGroup.update({
      where: { id: pending.id },
      data: {
        hidden: false,
        startDate: now,
        createdAt: now, // no longer "created ahead of its start" (see isPendingFirstDrop)
        endDate: new Date(now.getTime() + hotspot.pinDurationDays * 86_400_000),
      },
    });
    logger.info(`[hotspot-drop] Released first drop for hotspot=${hotspotId}`);
    return { droppedAt: now.toISOString(), count: pending._count.locations };
  }

  // ── Step 2d: One drop per cycle ────────────────────────────────────────────
  // Two looks within a cycle of each other must not both drop.
  if (!options.force) {
    const latest = await prisma.locationGroup.findFirst({
      where: { hotspotId, hidden: false },
      orderBy: { startDate: "desc" },
      select: { startDate: true },
    });
    const cycleMs = hotspot.dropEveryDays * 86_400_000;
    if (latest && now.getTime() - latest.startDate.getTime() < cycleMs - 10 * 60_000) {
      return { skipped: true, reason: "already dropped this cycle" };
    }
  }

  // ── Step 3: Read latest group for content fields ───────────────────────────
  const lastGroup = await prisma.locationGroup.findFirst({
    where: { hotspotId },
    orderBy: { startDate: "desc" },
    include: { _count: { select: { locations: true } } },
  });

  if (!lastGroup) {
    logger.warn(`[hotspot-drop] No LocationGroup found for hotspot: ${hotspotId}`);
    return { skipped: true, reason: "no locationGroup found" };
  }

  // ── Step 4: Generate pin coordinates ──────────────────────────────────────
  const pinEndDate = new Date(now.getTime() + hotspot.pinDurationDays * 86_400_000);

  const rawLocations = generateRandomLocations(
    hotspot.shape as "circle" | "rectangle" | "polygon",
    hotspot.geoJson as GeoJSON.Feature | null,
    // Same number of pins as the previous drop (the brand's "pins per drop").
    // Not `limit` — that's the collection limit, and 0 means unlimited.
    Math.max(1, lastGroup._count.locations),
  );

  const locations = rawLocations.map((loc) => ({
    latitude: loc.latitude,
    longitude: loc.longitude,
    autoCollect: hotspot.autoCollect,
  }));

  // ── Step 5: Write new LocationGroup + Locations ────────────────────────────
  await prisma.locationGroup.create({
    data: {
      hotspotId: hotspot.id,
      creatorId: lastGroup.creatorId,
      platformId: hotspot.platformId,
      title: lastGroup.title,
      description: lastGroup.description,
      image: lastGroup.image,
      optimizedImage: lastGroup.optimizedImage,
      link: lastGroup.link,
      type: lastGroup.type,
      latitude: lastGroup.latitude,
      longitude: lastGroup.longitude,
      radius: lastGroup.radius,
      approved: true,
      privacy: lastGroup.privacy,
      multiPin: lastGroup.multiPin,
      assetId: lastGroup.assetId,
      pageAsset: lastGroup.pageAsset,
      limit: lastGroup.limit,
      remaining: lastGroup.limit,
      subscriptionId: lastGroup.subscriptionId,
      startDate: now,
      endDate: pinEndDate,
      locations: {
        createMany: { data: locations },
      },
    },
  });

  logger.info(`[hotspot-drop] Dropped ${locations.length} pins for hotspot=${hotspotId}`);

  return { droppedAt: now.toISOString(), count: locations.length };
}

// ─── The worker's look ───────────────────────────────────────────────────────

export type DropSummary = {
  checked: number;
  dropped: number;
  released: number;
  ended: number;
  failed: number;
  errors: string[];
};

/**
 * Looks at every active hotspot and does what is due: release a first drop that waited for the
 * start date, drop for a slot that has come, or close a hotspot that has ended. One hotspot failing
 * does not stop the others; it is reported in the summary and the job is then failed so it shows.
 */
export async function dropDueHotspots(
  prisma: PrismaClient,
  now = new Date(),
): Promise<DropSummary> {
  const summary: DropSummary = {
    checked: 0,
    dropped: 0,
    released: 0,
    ended: 0,
    failed: 0,
    errors: [],
  };
  const hotspots = await prisma.hotspot.findMany({
    where: { isActive: true, hidden: false },
    select: {
      id: true,
      isActive: true,
      dropEveryDays: true,
      hotspotStartDate: true,
      hotspotEndDate: true,
      createdAt: true,
    },
  });

  for (const hotspot of hotspots) {
    summary.checked++;
    try {
      const groups = await prisma.locationGroup.findMany({
        where: { hotspotId: hotspot.id },
        select: { hidden: true, startDate: true, createdAt: true },
      });
      const visible = groups.filter((g) => !g.hidden);
      const latest = visible.reduce<Date | null>(
        (best, g) => (!best || g.startDate > best ? g.startDate : best),
        null,
      );
      const action = hotspotAction(
        hotspot,
        { latestDropStart: latest, pendingFirstDrop: groups.some(isPendingFirstDrop) },
        now,
      );
      if (action === "none") continue;

      if (action === "end") {
        await prisma.hotspot.update({ where: { id: hotspot.id }, data: { isActive: false } });
        summary.ended++;
        continue;
      }

      const result = await dropPinsForHotspot(prisma, hotspot.id, { force: true, now });
      if ("expired" in result) summary.ended++;
      else if ("skipped" in result)
        logger.warn(`[hotspot-drop] ${hotspot.id} skipped: ${result.reason}`);
      else if (action === "release") summary.released++;
      else summary.dropped++;
    } catch (error) {
      summary.failed++;
      summary.errors.push(
        `${hotspot.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      logger.error(`[hotspot-drop] ${hotspot.id} failed: ${String(error)}`);
    }
  }
  return summary;
}
