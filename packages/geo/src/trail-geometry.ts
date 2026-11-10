/**
 * Geometry for map trails: an ordered set of stops and the path between them
 * (see docs/trails). Pure functions (no map library), so the brand portal, the
 * fan apps and the tests share them.
 *
 * A trail's path is kept as one line per section (stop → next stop), each a list
 * of [lng, lat] points in Mapbox order, so one section can be re-routed or
 * switched to a straight line without touching the rest.
 */

import type { Feature, FeatureCollection, LineString } from "geojson";

import { haversineMetres, type LatLng } from "./map-geometry";

/** One section of a path: [lng, lat] points from one stop to the next. */
export type TrailSection = [number, number][];

/** What drawing a trail needs. */
export type TrailLine = {
  id: string;
  /** Any CSS colour Mapbox reads (hex, rgb(), hsl()). */
  color: string;
  /** Not published yet: drawn dashed. */
  draft: boolean;
  /** Stops are collected in order: drawn with direction arrows. */
  ordered: boolean;
  sections: TrailSection[];
};

/** Properties every trail line carries, for the map's style rules to read. */
export type TrailLineProps = Pick<TrailLine, "id" | "color" | "draft" | "ordered">;

const toPoint = ([lng, lat]: [number, number]): LatLng => ({ lat, lng });

/** Straight sections between stops in order (the path before any routing). */
export function straightSections(stops: LatLng[]): TrailSection[] {
  const sections: TrailSection[] = [];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    sections.push([
      [a.lng, a.lat],
      [b.lng, b.lat],
    ]);
  }
  return sections;
}

/** Length of one section in metres. */
export function sectionMetres(section: TrailSection): number {
  let metres = 0;
  for (let i = 1; i < section.length; i++)
    metres += haversineMetres(toPoint(section[i - 1]!), toPoint(section[i]!));
  return metres;
}

/** Length of a whole path in metres. */
export function pathMetres(sections: TrailSection[]): number {
  return sections.reduce((sum, s) => sum + sectionMetres(s), 0);
}

/**
 * About how long a path takes, in minutes: walking (~4.8 km/h), hiking (~3 km/h, for slopes
 * and rough ground), cycling or driving pace.
 */
export function estimateMinutes(
  metres: number,
  mode: "WALK" | "HIKE" | "BIKE" | "DRIVE" = "WALK",
): number {
  const metresPerMinute = { WALK: 80, HIKE: 50, BIKE: 250, DRIVE: 500 }[mode] ?? 80;
  return Math.max(1, Math.round(metres / metresPerMinute));
}

/**
 * The sections joined into one line (each section starts where the last ended,
 * so the shared point is kept once). Null when there is nothing to draw.
 */
export function joinSections(sections: TrailSection[]): [number, number][] | null {
  const line: [number, number][] = [];
  for (const s of sections) {
    for (const [i, p] of s.entries()) {
      const last = line[line.length - 1];
      if (i === 0 && last?.[0] === p[0] && last[1] === p[1]) continue;
      line.push(p);
    }
  }
  return line.length >= 2 ? line : null;
}

/** Trails as a GeoJSON collection for a map source: one line per trail, styled by its properties. */
export function trailsToFeatures(
  trails: TrailLine[],
): FeatureCollection<LineString, TrailLineProps> {
  const features: Feature<LineString, TrailLineProps>[] = [];
  for (const t of trails) {
    const coordinates = joinSections(t.sections);
    if (!coordinates) continue;
    features.push({
      type: "Feature",
      properties: { id: t.id, color: t.color, draft: t.draft, ordered: t.ordered },
      geometry: { type: "LineString", coordinates },
    });
  }
  return { type: "FeatureCollection", features };
}

/**
 * A short walking order through `points`: start at `start` (default: the first point),
 * then always go to the nearest stop not yet visited. Not always the shortest possible
 * order, but close for the handful of stops a trail has, and the same every time.
 * Returns indexes into `points`.
 */
export function nearestOrder(points: LatLng[], start = 0): number[] {
  if (!points.length) return [];
  const left = new Set(points.keys());
  const order: number[] = [];
  let at = Math.min(Math.max(start, 0), points.length - 1);
  while (left.size) {
    order.push(at);
    left.delete(at);
    let next = -1;
    let best = Infinity;
    for (const i of left) {
      const d = haversineMetres(points[at]!, points[i]!);
      if (d < best) {
        best = d;
        next = i;
      }
    }
    if (next < 0) break;
    at = next;
  }
  return order;
}

export type TrailBounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

/** The box around a trail's stops and path (for "trails in view" and fitting the map). */
export function trailBounds(stops: LatLng[], sections: TrailSection[] = []): TrailBounds | null {
  const points = [...stops, ...sections.flat().map(toPoint)];
  if (!points.length) return null;
  const b = { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 };
  for (const p of points) {
    b.minLat = Math.min(b.minLat, p.lat);
    b.maxLat = Math.max(b.maxLat, p.lat);
    b.minLng = Math.min(b.minLng, p.lng);
    b.maxLng = Math.max(b.maxLng, p.lng);
  }
  return b;
}
