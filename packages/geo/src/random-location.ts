import type { Feature, Polygon } from "geojson";

import { AppError, ErrorCodes } from "@wadzzo/errors";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_DEGREE_OF_LATITUDE = (EARTH_RADIUS_METERS * 2 * Math.PI) / 360;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** A uniformly random point in a disk of `radius` (sqrt keeps it from bunching at the centre). */
function randomPointInDisk(radius: number): { dx: number; dy: number } {
  const distance = radius * Math.sqrt(Math.random());
  const angle = Math.random() * 2 * Math.PI;
  return { dx: distance * Math.cos(angle), dy: distance * Math.sin(angle) };
}

/** A random point within `radiusMeters` of (`latitude`, `longitude`). */
export function randomLocation(
  latitude: number,
  longitude: number,
  radiusMeters: number,
): Coordinates {
  if (radiusMeters <= 0) return { latitude, longitude };

  const { dx, dy } = randomPointInDisk(radiusMeters);
  const metersPerDegreeOfLongitude = METERS_PER_DEGREE_OF_LATITUDE * Math.cos(toRadians(latitude));

  return {
    latitude: latitude + dy / METERS_PER_DEGREE_OF_LATITUDE,
    longitude: longitude + dx / metersPerDegreeOfLongitude,
  };
}

export type HotspotShape = "polygon" | "rectangle" | "circle";

/** Give up on a polygon after this many misses per requested point (thin or empty shapes). */
const MAX_POLYGON_ATTEMPTS_PER_POINT = 100;

/**
 * `count` random points inside a hotspot's shape.
 *
 * Both shapes use the app's `[latitude, longitude]` order (not GeoJSON's
 * `[longitude, latitude]`):
 * - circle: `properties = { center: [lat, lng], radiusMetres }`
 * - polygon / rectangle: the first ring of the `Polygon` geometry
 *
 * A polygon that is thin or tiny can return fewer than `count` points.
 */
export function generateRandomLocations(
  shape: HotspotShape,
  feature: Feature | null | undefined,
  count: number,
): Coordinates[] {
  if (!feature || count <= 0) return [];
  return shape === "circle" ? pointsInCircle(feature, count) : pointsInPolygon(feature, count);
}

function pointsInCircle(feature: Feature, count: number): Coordinates[] {
  const properties = feature.properties as {
    center?: [number, number];
    radiusMetres?: number;
  } | null;
  const [centerLatitude, centerLongitude] = properties?.center ?? [];
  const radiusMeters = properties?.radiusMetres;

  if (
    centerLatitude === undefined ||
    centerLongitude === undefined ||
    radiusMeters === undefined ||
    !(radiusMeters > 0)
  ) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: "A circle hotspot needs a centre and a radius.",
    });
  }

  return Array.from({ length: count }, () =>
    randomLocation(centerLatitude, centerLongitude, radiusMeters),
  );
}

type LatLngRing = [latitude: number, longitude: number][];

function pointsInPolygon(feature: Feature, count: number): Coordinates[] {
  const ring = (feature.geometry as Polygon | null)?.coordinates[0] as LatLngRing | undefined;
  if (!ring || ring.length < 3) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: "A polygon hotspot needs at least three points.",
    });
  }

  const latitudes = ring.map(([latitude]) => latitude);
  const longitudes = ring.map(([, longitude]) => longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  const points: Coordinates[] = [];
  const maxAttempts = count * MAX_POLYGON_ATTEMPTS_PER_POINT;

  // rejection sampling: draw in the bounding box, keep what falls inside the ring
  for (let attempt = 0; points.length < count && attempt < maxAttempts; attempt++) {
    const latitude = minLatitude + Math.random() * (maxLatitude - minLatitude);
    const longitude = minLongitude + Math.random() * (maxLongitude - minLongitude);
    if (isInsideRing(latitude, longitude, ring)) points.push({ latitude, longitude });
  }
  return points;
}

/** Ray casting: count the ring edges a ray from the point crosses; odd means inside. */
function isInsideRing(latitude: number, longitude: number, ring: LatLngRing): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i]!;
    const [latJ, lngJ] = ring[j]!;
    const crosses =
      lngI > longitude !== lngJ > longitude &&
      latitude < ((latJ - latI) * (longitude - lngI)) / (lngJ - lngI) + latI;
    if (crosses) inside = !inside;
  }
  return inside;
}
