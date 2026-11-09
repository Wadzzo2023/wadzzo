// Street paths between two trail stops, from Mapbox Directions (walking, cycling or driving),
// for the trail builder's "Snap to streets". Called only while a brand builds a trail: the
// result is saved with the trail, so viewing one never routes again. On any failure the caller
// gets null and keeps the straight line.

import type { TrailSection } from "@wadzzo/geo/trail-geometry";
import type { TrailMode } from "@wadzzo/schemas/trail";

import { env } from "../../env";

const PROFILE: Record<TrailMode, string> = {
  WALK: "walking",
  BIKE: "cycling",
  DRIVE: "driving",
};

/** Answers kept per pair of points and mode: a brand dragging stops back and forth asks again. */
const CACHE_SIZE = 500;
const cache = new Map<string, TrailSection>();

const key = (mode: TrailMode, pts: [number, number][]) =>
  `${mode}:${pts.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(";")}`;

/**
 * The street path through `points` ([lng, lat]: the two stops, plus any bends the brand
 * added), as one trail section from the first point to the last. Null when Mapbox has no
 * route, no token is set, or the request fails.
 */
export async function routeSection(
  mode: TrailMode,
  points: [number, number][],
): Promise<TrailSection | null> {
  const token = env.MAPBOX_TOKEN ?? env.NEXT_PUBLIC_MAPBOX_API;
  if (!token || points.length < 2 || points.length > 25) return null;
  const k = key(mode, points);
  const hit = cache.get(k);
  if (hit) return hit;

  try {
    const coords = points.map(([lng, lat]) => `${lng},${lat}`).join(";");
    const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${PROFILE[mode]}/${coords}`);
    url.search = new URLSearchParams({
      geometries: "geojson",
      overview: "full",
      access_token: token,
    }).toString();
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      routes?: { geometry?: { coordinates?: [number, number][] } }[];
    };
    const line = body.routes?.[0]?.geometry?.coordinates;
    if (!line || line.length < 2) return null;
    // Start and end exactly on the stops, so sections join up on the pins.
    const section: TrailSection = [points[0]!, ...line.slice(1, -1), points[points.length - 1]!];
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
    cache.set(k, section);
    return section;
  } catch {
    return null;
  }
}
