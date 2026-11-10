import { describe, expect, it } from "vitest";

import { muralQueryBox } from "../area";

describe("muralQueryBox", () => {
  it("rounds a normal view out to ~1 km", () => {
    expect(muralQueryBox({ north: 23.9412, south: 23.9301, east: 90.3021, west: 90.2911 })).toEqual(
      {
        north: 23.95,
        south: 23.93,
        east: 90.31,
        west: 90.29,
      },
    );
  });
  it("wraps a view running past the date line (zoomed-out globe)", () => {
    const b = muralQueryBox({ north: 74.54, south: -84.73, east: 203.75, west: 44.4 });
    expect(b.east).toBeCloseTo(-156.25);
    expect(b.west).toBe(44.4);
    expect(b.west).toBeGreaterThan(b.east);
  });
  it("is the whole world when the view is wider than it, and keeps latitudes in range", () => {
    expect(muralQueryBox({ north: 95, south: -120, east: 400, west: -200 })).toEqual({
      north: 90,
      south: -90,
      east: 180,
      west: -180,
    });
  });
});
