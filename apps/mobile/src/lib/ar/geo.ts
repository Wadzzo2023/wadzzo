// Ported verbatim from wadzzoAR/src/lib/ar/geo.ts @ 3437383 — keep in sync with the web.
import type { Coords } from "./types";

/** Mean Earth radius, metres. */
const R = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Great-circle distance in metres. Haversine is overkill for the sub-kilometre
 * hops this app deals in, but it costs nothing and stays correct if a brand
 * ever drops a pin a continent away.
 */
export function distanceMeters(a: Coords, b: Coords): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Initial bearing from `a` to `b`, in degrees clockwise from true north.
 * This is what aims the AR camera placement and the direction arrow.
 */
export function bearingDegrees(a: Coords, b: Coords): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Move `from` by `meters` along `bearing`. Used to scatter the mock drop
 * around wherever the viewer actually is, so the map is never a dead sea of
 * empty tiles in a city the demo data didn't anticipate.
 */
export function offsetBy(
  from: Coords,
  meters: number,
  bearingDeg: number,
): Coords {
  const d = meters / R;
  const brng = toRad(bearingDeg);
  const lat1 = toRad(from.lat);
  const lng1 = toRad(from.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: toDeg(lat2), lng: ((toDeg(lng2) + 540) % 360) - 180 };
}

/** The radius, in metres, inside which a pin becomes capturable in AR. */
export const AR_CAPTURE_RADIUS = 75;

/**
 * "120 m" / "1.4 km". Metres stay whole below a kilometre — nobody walks
 * 84.3 metres — and kilometres keep one decimal so the number still moves.
 */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Compass point for a bearing — "NE", "SSW". Eight points is plenty. */
export function compassPoint(bearingDeg: number): string {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
  return points[Math.round(((bearingDeg % 360) + 360) % 360 / 45) % 8]!;
}

/**
 * Rough walking/cycling/driving time for a straight-line distance, in minutes.
 * Deliberately a placeholder: the real sheet calls Mapbox Directions. Speeds
 * are conservative real-world averages including stops, not textbook maxima.
 */
export const TRAVEL_SPEEDS_MPS = {
  walk: 1.35,
  cycle: 4.2,
  transit: 6.5,
  drive: 9.0,
} as const;

export function travelMinutes(
  meters: number,
  mode: keyof typeof TRAVEL_SPEEDS_MPS,
): number {
  return Math.max(1, Math.round(meters / TRAVEL_SPEEDS_MPS[mode] / 60));
}
