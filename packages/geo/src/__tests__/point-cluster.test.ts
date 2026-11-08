import { describe, expect, it } from "vitest";

import { PointIndex, type ViewBounds } from "../point-cluster";

type P = { id: string; lat: number; lng: number };
const index = (pts: P[]) =>
  new PointIndex(
    pts,
    (p) => p,
    (p) => p.id,
  );

const WORLD: ViewBounds = { west: -180, south: -85, east: 180, north: 85 };
// About a city: a few km across.
const CITY: ViewBounds = { west: 90.38, south: 23.78, east: 90.44, north: 23.84 };

describe("PointIndex", () => {
  const near = (id: string, i: number): P => ({ id, lat: 23.81 + i * 0.0001, lng: 90.41 });

  it("groups points that would overlap, and leaves distant ones alone", () => {
    const idx = index([
      near("a", 0),
      near("b", 1),
      near("c", 2),
      { id: "far", lat: 23.83, lng: 90.43 },
    ]);
    const out = idx.query(CITY, 12);
    const clusters = out.filter((r) => r.type === "cluster");
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ count: 3 });
    expect(out.filter((r) => r.type === "point").map((r) => r.key)).toEqual(["far"]);
  });

  it("joins groups that fall in neighbouring cells but would still overlap on screen", () => {
    // Two clumps a hair apart, placed so a grid line runs between them.
    const idx = index([
      { id: "a", lat: 23.81, lng: 90.4099 },
      { id: "b", lat: 23.81, lng: 90.40995 },
      { id: "c", lat: 23.81, lng: 90.41005 },
      { id: "d", lat: 23.81, lng: 90.4101 },
    ]);
    const out = idx.query(CITY, 12);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "cluster", count: 4 });
    // Far enough apart on screen: still separate marks.
    const apart = index([near("a", 0), { id: "z", lat: 23.83, lng: 90.43 }]).query(CITY, 12);
    expect(apart).toHaveLength(2);
  });

  it("keeps every point exactly once, whether grouped or not", () => {
    const pts = Array.from({ length: 500 }, (_, i) => ({
      id: `p${i}`,
      lat: 23.78 + (i % 25) * 0.002,
      lng: 90.38 + Math.floor(i / 25) * 0.003,
    }));
    for (const zoom of [8, 12, 15, 17]) {
      const out = index(pts).query(CITY, zoom);
      const total = out.reduce((n, r) => n + (r.type === "cluster" ? r.count : 1), 0);
      expect(total).toBe(500);
    }
  });

  it("shows fewer marks the further out you are", () => {
    const pts = Array.from({ length: 400 }, (_, i) => ({
      id: `p${i}`,
      lat: 23.78 + (i % 20) * 0.003,
      lng: 90.38 + Math.floor(i / 20) * 0.003,
    }));
    const idx = index(pts);
    const counts = [10, 13, 16].map((z) => idx.query(CITY, z).length);
    expect(counts[0]).toBeLessThan(counts[1]!);
    expect(counts[1]).toBeLessThan(counts[2]!);
    expect(counts[2]).toBe(400); // from the max zoom nothing is grouped
  });

  it("only returns what is in view", () => {
    const idx = index([near("in", 0), { id: "out", lat: 10, lng: 10 }]);
    const out = idx.query(CITY, 14);
    expect(out.map((r) => r.key)).toEqual(["in"]);
    expect(idx.query(WORLD, 1).length).toBeGreaterThan(0);
  });

  it("gives a cluster the extent and middle of its points, and a stable key", () => {
    const idx = index([near("b", 0), near("a", 1), near("c", 2)]);
    const [c] = idx.query(CITY, 12);
    expect(c).toMatchObject({ type: "cluster", count: 3, key: "c:a:3" });
    if (c?.type !== "cluster") return expect.fail("expected a cluster");
    expect(c.bounds.south).toBeCloseTo(23.81, 5);
    expect(c.bounds.north).toBeCloseTo(23.8102, 5);
    expect(c.lat).toBeCloseTo(23.8101, 5);
    // The same key after the view moves a little.
    const [moved] = idx.query({ ...CITY, east: CITY.east + 0.005 }, 12);
    expect(moved?.key).toBe(c.key);
  });

  it("can give each cluster a few of its points that differ, e.g. by image", () => {
    const pts = [
      { id: "a", lat: 23.81, lng: 90.41, img: "x.png" },
      { id: "b", lat: 23.8101, lng: 90.41, img: "x.png" },
      { id: "c", lat: 23.8102, lng: 90.41, img: "y.png" },
      { id: "d", lat: 23.8103, lng: 90.41, img: "z.png" },
      { id: "e", lat: 23.8104, lng: 90.41, img: null },
    ];
    const idx = new PointIndex(
      pts,
      (p) => p,
      (p) => p.id,
    );
    const [c] = idx.query(CITY, 12, { sample: { size: 2, by: (p) => p.img } });
    if (c?.type !== "cluster") return expect.fail("expected a cluster");
    expect(c.count).toBe(5);
    expect(c.sample.map((p) => p.img)).toEqual(["x.png", "y.png"]);
    const [all] = idx.query(CITY, 12, { sample: { size: 9, by: (p) => p.img } });
    expect(all?.type === "cluster" && all.sample.map((p) => p.img)).toEqual([
      "x.png",
      "y.png",
      "z.png",
    ]);
    // Not asked for: no samples.
    const [none] = idx.query(CITY, 12);
    expect(none?.type === "cluster" && none.sample).toEqual([]);
  });

  it("copes with no points and with points past the poles", () => {
    expect(index([]).query(WORLD, 3)).toEqual([]);
    const out = index([{ id: "pole", lat: 89.9, lng: 0 }]).query(WORLD, 2);
    expect(out).toHaveLength(1);
  });

  it("is fast enough for a very large account", () => {
    const pts = Array.from({ length: 50_000 }, (_, i) => ({
      id: `p${i}`,
      lat: 23.5 + Math.random() * 0.6,
      lng: 90.1 + Math.random() * 0.6,
    }));
    const t0 = Date.now();
    const idx = index(pts);
    const built = Date.now() - t0;
    const t1 = Date.now();
    const out = idx.query({ west: 90.1, south: 23.5, east: 90.7, north: 24.1 }, 11);
    const queried = Date.now() - t1;
    expect(out.length).toBeLessThan(2000);
    expect(built).toBeLessThan(500);
    expect(queried).toBeLessThan(150);
  });
});
