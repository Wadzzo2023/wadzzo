// Between saved trails (the trail router), the map (TrailLayer, PinLayer stops) and Trail mode's
// working copy (builder-store).

import { trailBounds, type TrailLine } from "@wadzzo/geo/trail-geometry";
import { TRAIL_COLORS, type TrailStatus } from "@wadzzo/schemas/trail";
import type { Tone } from "@wadzzo/ui/patterns/status-pill";

import type { TrailStops } from "~/components/map-kit/pin-layer";
import type { PinOnMap } from "~/store/map-stores";
import type { RouterOutputs } from "~/utils/api";

import { previewPath, sectionKey, type DrawingSection, type TrailDraft } from "./builder-store";

export type TrailView = RouterOutputs["maps"]["trail"]["list"][number];

/** The id the trail being edited is drawn under (a new one has no id yet). */
export const DRAFT_LINE_ID = "draft";

export const STATUS_TONE: Record<TrailStatus, Tone> = {
  DRAFT: "neutral",
  PENDING: "warning",
  LIVE: "success",
  ENDED: "neutral",
};

export const trailColor = (t: { color?: string | null }) => t.color ?? TRAIL_COLORS[0];

export const distanceLabel = (m: number) =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;

/** A saved trail as a line on the map (dashed until it is live). */
export function lineOf(t: TrailView): TrailLine {
  return {
    id: t.id,
    color: trailColor(t),
    draft: t.status !== "LIVE",
    ordered: t.order === "ORDERED",
    sections: t.path,
  };
}

/** A trail's stops for PinLayer: each stop's drop → its number. */
export function stopsOf(
  t: Pick<TrailView, "color"> & { stops: { position: number; pin: { id: string } }[] },
): TrailStops {
  return {
    color: trailColor(t),
    positions: new Map(t.stops.map((s) => [s.pin.id, s.position])),
  };
}

/** The trail being built, with the section being drawn shown as it stands. */
export function draftLine(d: TrailDraft, drawing: DrawingSection | null = null): TrailLine {
  return {
    id: DRAFT_LINE_ID,
    color: d.color,
    draft: true,
    ordered: d.order === "ORDERED",
    sections: previewPath(d, drawing),
  };
}

export function draftStops(d: TrailDraft): TrailStops {
  return { color: d.color, positions: new Map(d.stops.map((s, i) => [s.pinId, i + 1])) };
}

/** The box to fit the map to. */
export function boundsOf(
  points: { lat: number; lng: number }[],
  sections: TrailLine["sections"] = [],
) {
  const b = trailBounds(points, sections);
  return b
    ? ([
        [b.minLng, b.minLat],
        [b.maxLng, b.maxLat],
      ] as [[number, number], [number, number]])
    : null;
}

/** A new trail: two weeks from now, the theme's colour, nothing else yet. */
export function blankDraft(creatorId?: string): TrailDraft {
  const now = new Date();
  return {
    creatorId,
    status: "DRAFT",
    title: "",
    description: "",
    coverImage: null,
    mode: "WALK",
    order: "ORDERED",
    color: TRAIL_COLORS[0],
    startDate: now,
    endDate: new Date(now.getTime() + 30 * 86_400_000),
    stops: [],
    routes: {},
    stopDefaults: {},
    reward: null,
  };
}

/** A saved trail as Trail mode's working copy. */
export function toDraft(t: TrailView): TrailDraft {
  const routes: TrailDraft["routes"] = {};
  t.stops.forEach((s, i) => {
    const next = t.stops[i + 1];
    const section = t.path[i];
    // A section with bends in it was routed; a two-point one is the straight line.
    if (next && section && section.length > 2)
      routes[sectionKey({ pinId: s.pin.id }, { pinId: next.pin.id })] = section;
  });
  return {
    id: t.id,
    updatedAt: new Date(t.updatedAt),
    creatorId: t.creatorId,
    status: t.status,
    reviewNote: t.reviewNote,
    title: t.title,
    description: t.description ?? "",
    coverImage: t.coverImage,
    mode: t.mode,
    order: t.order === "ANY" ? "ANY" : "ORDERED",
    color: trailColor(t),
    startDate: new Date(t.startDate),
    endDate: new Date(t.endDate),
    stops: t.stops.map((s) => ({
      pinId: s.pin.id,
      title: s.pin.title,
      lat: s.pin.latitude,
      lng: s.pin.longitude,
      image: s.pin.image,
      required: s.required,
      clue: s.clue,
    })),
    routes,
    stopDefaults: t.stopDefaults,
    reward: t.reward
      ? { assetId: t.reward.asset.id, limit: t.reward.limit, minStops: t.reward.minStops }
      : null,
  };
}

/** Why a pin on the map can't be a stop, or null when it can. */
export function whyNotStop(p: PinOnMap, now = Date.now()): string | null {
  const g = p.locationGroup;
  if (!g) return "This pin can't be a stop";
  // Hotspot drops come and go, so they can't be trail stops.
  if (g.hotspotId) return "Hotspot drops come and go, so they can't be trail stops";
  if (p.hidden) return "This pin was deleted";
  if (new Date(g.endDate).getTime() < now) return "This pin has ended";
  return null;
}
