import { describe, expect, it } from "vitest";

import {
  circleAround,
  featureCenter,
  haversineMetres,
  moveArea,
  polygonFeature,
  rectangleFeature,
  type LatLng,
  type StoredFeature,
} from "../map-geometry";

const corners = (f: StoredFeature): LatLng[] =>
  f.geometry.coordinates[0]!.slice(0, -1).map(([lat, lng]) => ({ lat: lat!, lng: lng! }));

/** Every pairwise distance between corners, so size and shape can be compared. */
const distances = (f: StoredFeature) => {
  const c = corners(f);
  return c.flatMap((a, i) => c.slice(i + 1).map((b) => haversineMetres(a, b)));
};

describe("moveArea", () => {
  const dhaka = { lat: 23.81, lng: 90.41 };
  const oslo = { lat: 59.91, lng: 10.75 };

  it("puts a polygon's centre on the new spot", () => {
    const f = polygonFeature([
      { lat: 23.81, lng: 90.41 },
      { lat: 23.812, lng: 90.414 },
      { lat: 23.808, lng: 90.416 },
    ]);
    const moved = moveArea(f, oslo);
    const c = featureCenter(moved);
    expect(c.lat).toBeCloseTo(oslo.lat, 5);
    expect(c.lng).toBeCloseTo(oslo.lng, 5);
  });

  it("keeps a rectangle's real size when moved far north", () => {
    const f = rectangleFeature(dhaka, { lat: 23.82, lng: 90.42 });
    const before = distances(f);
    const after = distances(moveArea(f, oslo));
    before.forEach((d, i) => expect(Math.abs(after[i]! - d) / d).toBeLessThan(0.01));
  });

  it("keeps the ring closed", () => {
    const ring = moveArea(rectangleFeature(dhaka, { lat: 23.82, lng: 90.42 }), oslo).geometry
      .coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("rebuilds a circle around the new centre with the same radius", () => {
    const f = circleAround(dhaka, 300);
    const moved = moveArea(f, oslo);
    expect(moved.properties?.center).toEqual([oslo.lat, oslo.lng]);
    expect(moved.properties?.radiusMetres).toBeCloseTo(300, 6);
    for (const p of corners(moved)) expect(haversineMetres(p, oslo)).toBeCloseTo(300, -1);
  });

  it("stays on the map near the poles", () => {
    const f = rectangleFeature(dhaka, { lat: 23.9, lng: 90.5 });
    for (const p of corners(moveArea(f, { lat: 84.99, lng: 0 }))) {
      expect(p.lat).toBeLessThanOrEqual(85);
      expect(Number.isFinite(p.lng)).toBe(true);
    }
  });

  it("does not change the original", () => {
    const f = rectangleFeature(dhaka, { lat: 23.82, lng: 90.42 });
    const copy = JSON.parse(JSON.stringify(f)) as StoredFeature;
    moveArea(f, oslo);
    expect(f).toEqual(copy);
  });
});
