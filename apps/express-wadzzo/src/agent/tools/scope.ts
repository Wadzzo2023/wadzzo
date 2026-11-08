// src/agent/tools/scope.ts
//
// Brand-scoped reads shared by the tools. Every query here filters on the
// run's own creatorId; ids the model passes in are only ever used together
// with that filter, so an id from another brand simply matches nothing.

import type { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import type {
  HotspotItem,
  PinItem,
  PinLookChoice,
  PinStatus,
  PinTypeName,
} from "@wadzzo/agent-contract";
import { BUILTIN_SHAPE_IDS, BUILTIN_SHAPES, isBuiltinShape } from "@wadzzo/schemas/pin-look";
import { inArea, type Box, type SearchArea } from "../area";

export const PIN_TYPES = [
  "LANDMARK",
  "EVENT",
  "EXPERIENCE",
  "LAUNCH",
  "BOUNTY",
  "OTHER",
] as const satisfies readonly PinTypeName[];

export type PinFilter = {
  ids?: string[];
  text?: string;
  type?: PinTypeName;
  status?: PinStatus | "current" | "any";
  area?: SearchArea | null;
  createdInLastDays?: number;
  limit: number;
};

export function pinStatus(
  p: { approved: boolean | null; startDate: Date; endDate: Date },
  now = new Date(),
): PinStatus {
  if (p.endDate < now) return "expired";
  if (p.approved === false) return "rejected";
  if (p.approved !== true) return "in_review";
  if (p.startDate > now) return "upcoming";
  return "active";
}

function statusWhere(status: PinFilter["status"], now: Date): Prisma.LocationGroupWhereInput {
  switch (status) {
    case "active":
      return { approved: true, startDate: { lte: now }, endDate: { gte: now } };
    case "upcoming":
      return { approved: true, startDate: { gt: now } };
    case "expired":
      return { endDate: { lt: now } };
    case "in_review":
      return { approved: null, endDate: { gte: now } };
    case "rejected":
      return { approved: false };
    case "any":
      return {};
    default: // "current": everything not yet expired
      return { endDate: { gte: now } };
  }
}

const boxWhere = (box: Box) => ({
  latitude: { gte: box.south, lte: box.north },
  longitude: { gte: box.west, lte: box.east },
});

/** The brand's pins matching `filter`, newest first, and how many matched in total. */
export async function findPins(
  creatorId: string,
  filter: PinFilter,
): Promise<{ items: PinItem[]; total: number }> {
  const now = new Date();
  const where: Prisma.LocationGroupWhereInput = {
    creatorId,
    hidden: false,
    ...statusWhere(filter.ids ? "any" : filter.status, now),
    ...(filter.ids && { id: { in: filter.ids } }),
    ...(filter.type && { type: filter.type }),
    ...(filter.text && {
      OR: [
        { title: { contains: filter.text, mode: "insensitive" } },
        { description: { contains: filter.text, mode: "insensitive" } },
      ],
    }),
    ...(filter.createdInLastDays && {
      createdAt: { gte: new Date(now.getTime() - filter.createdInLastDays * 86_400_000) },
    }),
    ...(filter.area && boxWhere(filter.area.box)),
  };

  const rows = await db.locationGroup.findMany({
    where,
    orderBy: { createdAt: "desc" },
    // A polygon area is filtered after the box query, so fetch a little extra.
    take: filter.area?.rings ? filter.limit * 3 : filter.limit,
    select: {
      id: true,
      title: true,
      type: true,
      latitude: true,
      longitude: true,
      startDate: true,
      endDate: true,
      approved: true,
      image: true,
      hotspotId: true,
      locations: {
        where: { hidden: false },
        select: { _count: { select: { consumers: { where: { hidden: false } } } } },
      },
    },
  });
  const inside = filter.area
    ? rows.filter((r) => inArea(filter.area!, r.latitude, r.longitude))
    : rows;
  const total = filter.area?.rings ? inside.length : await db.locationGroup.count({ where });

  return {
    total,
    items: inside.slice(0, filter.limit).map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type as PinTypeName,
      lat: r.latitude,
      lng: r.longitude,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
      status: pinStatus(r, now),
      locations: r.locations.length,
      collected: r.locations.reduce((s, l) => s + l._count.consumers, 0),
      image: r.image,
      hotspotId: r.hotspotId,
    })),
  };
}

/** The brand's own saved pin shapes (retired ones left out), most recently changed first. */
export async function listPinShapes(creatorId: string) {
  return db.pinShape.findMany({
    where: { creatorId, archived: false },
    select: { id: true, name: true, anchor: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

const FILLER = new Set([
  "the",
  "a",
  "an",
  "my",
  "our",
  "your",
  "pin",
  "pins",
  "shape",
  "shapes",
  "one",
  "use",
  "with",
  "of",
  "and",
]);

/**
 * Which shapes the person's words point at. A name typed in full wins over partial
 * matches ("Forest troll" is one shape even though "Shaggy forest troll" also has
 * those words); otherwise every shape sharing a word with them matches. More than
 * one match means the agent has to ask which.
 */
export function matchShapes<T extends { name: string }>(words: string, shapes: T[]): T[] {
  const tokens = (text: string) =>
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !FILLER.has(t));
  const wanted = tokens(words);
  if (!wanted.length) return [];
  const exact = shapes.filter((s) => tokens(s.name).join(" ") === wanted.join(" "));
  if (exact.length) return exact;
  return shapes.filter((s) => {
    const name = s.name.toLowerCase();
    return wanted.some((t) => name.includes(t));
  });
}

/** The shapes every brand has. */
export const builtInShapes = BUILTIN_SHAPE_IDS.map((id) => ({
  id,
  name: BUILTIN_SHAPES[id].name,
}));

/**
 * The look a proposal asks for, from a shape id the model passed: a built-in shape
 * or one of the brand's own. Anything else is an error the model can act on (the
 * brand app checks again when the person confirms).
 */
export async function pinLookFor(
  creatorId: string,
  shape: string | undefined,
): Promise<PinLookChoice | undefined> {
  if (!shape) return undefined;
  if (isBuiltinShape(shape)) return { shape };
  const own = await db.pinShape.findFirst({
    where: { id: shape, creatorId, archived: false },
    select: { id: true },
  });
  if (!own)
    throw new Error(
      `"${shape}" isn't one of this brand's pin shapes or a built-in one. Use list_pin_shapes to get the right id.`,
    );
  return { shape: own.id };
}

/** Ids from `ids` that are the brand's own live pins, with their titles. */
export async function ownPins(creatorId: string, ids: string[]) {
  return db.locationGroup.findMany({
    where: { id: { in: ids }, creatorId, hidden: false },
    select: { id: true, title: true },
  });
}

export async function findHotspots(
  creatorId: string,
  opts: { ids?: string[]; text?: string; status?: "active" | "paused" | "any"; limit: number },
): Promise<HotspotItem[]> {
  const rows = await db.hotspot.findMany({
    where: {
      creatorId,
      hidden: false,
      ...(opts.ids && { id: { in: opts.ids } }),
      ...(opts.status === "active" && { isActive: true }),
      ...(opts.status === "paused" && { isActive: false }),
      // A hotspot is named after its drops.
      ...(opts.text && {
        locationGroups: { some: { title: { contains: opts.text, mode: "insensitive" } } },
      }),
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit,
    select: {
      id: true,
      isActive: true,
      dropEveryDays: true,
      pinDurationDays: true,
      hotspotStartDate: true,
      hotspotEndDate: true,
      autoCollect: true,
      geoJson: true,
      locationGroups: { orderBy: { createdAt: "desc" }, select: { title: true } },
    },
  });
  return rows.map((h) => ({
    id: h.id,
    title: h.locationGroups[0]?.title ?? "Hotspot",
    isActive: h.isActive,
    dropEveryDays: h.dropEveryDays,
    pinDurationDays: h.pinDurationDays,
    startDate: h.hotspotStartDate.toISOString(),
    endDate: h.hotspotEndDate.toISOString(),
    autoCollect: h.autoCollect,
    drops: h.locationGroups.length,
    geoJson: h.geoJson,
  }));
}

/** Pins within `metres` of a point, to flag places the brand already covers. */
export async function pinsNear(creatorId: string, box: Box) {
  return db.locationGroup.findMany({
    where: { creatorId, hidden: false, endDate: { gte: new Date() }, ...boxWhere(box) },
    select: { latitude: true, longitude: true },
    take: 5000,
  });
}
