import { describe, expect, it } from "vitest";

import { haversineMetres } from "../map-geometry";
import {
  estimateMinutes,
  joinSections,
  nearestOrder,
  pathMetres,
  straightSections,
  trailBounds,
  trailsToFeatures,
  type TrailLine,
} from "../trail-geometry";

const a = { lat: 23.81, lng: 90.41 };
const b = { lat: 23.812, lng: 90.414 };
const c = { lat: 23.816, lng: 90.418 };

describe("straightSections", () => {
  it("makes one [lng, lat] section between each pair of stops", () => {
    const s = straightSections([a, b, c]);
    expect(s).toEqual([
      [
        [a.lng, a.lat],
        [b.lng, b.lat],
      ],
      [
        [b.lng, b.lat],
        [c.lng, c.lat],
      ],
    ]);
  });

  it("has no sections for fewer than two stops", () => {
    expect(straightSections([])).toEqual([]);
    expect(straightSections([a])).toEqual([]);
  });
});

describe("pathMetres", () => {
  it("adds up every section", () => {
    const total = pathMetres(straightSections([a, b, c]));
    expect(total).toBeCloseTo(haversineMetres(a, b) + haversineMetres(b, c), 6);
  });
});

describe("estimateMinutes", () => {
  it("walks slower than it cycles or drives", () => {
    expect(estimateMinutes(2400, "WALK")).toBe(30);
    expect(estimateMinutes(2400, "BIKE")).toBeLessThan(30);
    expect(estimateMinutes(2400, "DRIVE")).toBeLessThan(estimateMinutes(2400, "BIKE"));
  });

  it("never says zero minutes", () => {
    expect(estimateMinutes(0)).toBe(1);
  });
});

describe("joinSections", () => {
  it("keeps a shared point between sections once", () => {
    const line = joinSections(straightSections([a, b, c]));
    expect(line).toHaveLength(3);
  });

  it("is null when there is nothing to draw", () => {
    expect(joinSections([])).toBeNull();
  });
});

describe("trailsToFeatures", () => {
  const trail: TrailLine = {
    id: "t1",
    color: "#16a34a",
    draft: false,
    ordered: true,
    sections: straightSections([a, b, c]),
  };

  it("makes one line feature per trail, carrying its style properties", () => {
    const fc = trailsToFeatures([trail]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties).toEqual({
      id: "t1",
      color: "#16a34a",
      draft: false,
      ordered: true,
    });
    expect(fc.features[0]!.geometry.coordinates).toHaveLength(3);
  });

  it("skips a trail with no path yet", () => {
    expect(trailsToFeatures([{ ...trail, sections: [] }]).features).toHaveLength(0);
  });
});

describe("nearestOrder", () => {
  it("visits the nearest stop next", () => {
    // c is far from a; b sits between them.
    expect(nearestOrder([a, c, b])).toEqual([0, 2, 1]);
  });

  it("starts where asked and visits every stop once", () => {
    const order = nearestOrder([a, b, c], 2);
    expect(order[0]).toBe(2);
    expect([...order].sort()).toEqual([0, 1, 2]);
  });

  it("handles no stops", () => {
    expect(nearestOrder([])).toEqual([]);
  });
});

describe("trailBounds", () => {
  it("covers stops and path", () => {
    const b = trailBounds(
      [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
      [
        [
          [2, 1],
          [5, 0.5],
        ],
      ],
    );
    expect(b).toEqual({ minLat: 0.5, maxLat: 3, minLng: 2, maxLng: 5 });
  });
  it("is null with nothing", () => {
    expect(trailBounds([])).toBeNull();
  });
});
