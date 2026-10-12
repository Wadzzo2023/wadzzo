import type { Feature } from "geojson";
import { describe, expect, it } from "vitest";

import { generateRandomLocations, randomLocation } from "../random-location";

/** Distance in meters (haversine). */
function distanceMeters(a: { latitude: number; longitude: number }, b: [number, number]) {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a.latitude);
  const dLng = rad(b[1] - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

describe("randomLocation", () => {
  it("stays within the radius", () => {
    for (let i = 0; i < 500; i++) {
      const point = randomLocation(23.78, 90.4, 250);
      expect(distanceMeters(point, [23.78, 90.4])).toBeLessThanOrEqual(251);
    }
  });

  it("returns the centre for no radius", () => {
    expect(randomLocation(10, 20, 0)).toEqual({ latitude: 10, longitude: 20 });
    expect(randomLocation(10, 20, -5)).toEqual({ latitude: 10, longitude: 20 });
  });
});

describe("generateRandomLocations", () => {
  const circle: Feature = {
    type: "Feature",
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { center: [40.7, -74], radiusMetres: 300 },
  };
  // a ~1km square, in [lat, lng] order
  const square: Feature = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [40.0, -74.0],
          [40.0, -73.99],
          [40.01, -73.99],
          [40.01, -74.0],
          [40.0, -74.0],
        ],
      ],
    },
  };

  it("makes exactly `count` points in a circle", () => {
    const points = generateRandomLocations("circle", circle, 40);
    expect(points).toHaveLength(40);
    for (const point of points) {
      expect(distanceMeters(point, [40.7, -74])).toBeLessThanOrEqual(301);
    }
  });

  it("keeps polygon and rectangle points inside the ring", () => {
    for (const shape of ["polygon", "rectangle"] as const) {
      const points = generateRandomLocations(shape, square, 50);
      expect(points).toHaveLength(50);
      for (const { latitude, longitude } of points) {
        expect(latitude).toBeGreaterThanOrEqual(40.0);
        expect(latitude).toBeLessThanOrEqual(40.01);
        expect(longitude).toBeGreaterThanOrEqual(-74.0);
        expect(longitude).toBeLessThanOrEqual(-73.99);
      }
    }
  });

  it("returns nothing for no shape or no count", () => {
    expect(generateRandomLocations("circle", null, 5)).toEqual([]);
    expect(generateRandomLocations("circle", circle, 0)).toEqual([]);
  });

  it("refuses shapes that can't hold points, with an app error", () => {
    const noCentre: Feature = { type: "Feature", geometry: circle.geometry, properties: null };
    expect(() => generateRandomLocations("circle", noCentre, 1)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
    const notAPolygon: Feature = { type: "Feature", geometry: circle.geometry, properties: {} };
    expect(() => generateRandomLocations("polygon", notAPolygon, 1)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
  });
});
