import { describe, expect, it } from "vitest";

import { checkShapePath } from "../pin-look";
import {
  fitToBox,
  flipNodes,
  freehandToNodes,
  mirrorPoints,
  nodesToPath,
  outlineProblems,
  pathToNodes,
  pathToPoints,
  pointsToPath,
  polygonArea,
  selfIntersects,
  simplify,
  traceImage,
  traceMask,
  type Node,
  type Pt,
} from "../shape-geometry";

const square: Pt[] = [
  [10, 10],
  [90, 10],
  [90, 90],
  [10, 90],
];

describe("pointsToPath", () => {
  it("makes a valid pin outline, straight or smooth", () => {
    expect(checkShapePath(pointsToPath(square)).ok).toBe(true);
    expect(checkShapePath(pointsToPath(square, true)).ok).toBe(true);
  });

  it("keeps smooth curves inside the box even for points on the edge", () => {
    const edge: Pt[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    expect(checkShapePath(pointsToPath(edge, true)).ok).toBe(true);
  });

  it("needs three points", () => {
    expect(
      pointsToPath([
        [1, 1],
        [2, 2],
      ]),
    ).toBe("");
  });
});

describe("checks", () => {
  it("spots a bow-tie", () => {
    const bow: Pt[] = [
      [10, 10],
      [90, 90],
      [90, 10],
      [10, 90],
    ];
    expect(selfIntersects(bow)).toBe(true);
    expect(selfIntersects(square)).toBe(false);
    // Only the crossing is reported: a bow tie's halves cancel out, so "too small" would mislead.
    expect(outlineProblems(bow)).toEqual([expect.stringMatching(/crosses itself/)]);
  });

  it("flags a sliver too thin to hold an image", () => {
    expect(
      outlineProblems([
        [10, 50],
        [90, 50],
        [90, 53],
        [10, 53],
      ]).join(),
    ).toMatch(/too small or thin/);
    expect(outlineProblems(square)).toEqual([]);
  });

  it("measures area", () => {
    expect(Math.abs(polygonArea(square))).toBe(6400);
  });
});

describe("mirrorPoints", () => {
  it("completes a symmetric shape from its left half", () => {
    const half: Pt[] = [
      [50, 5],
      [20, 40],
      [35, 95],
      [50, 95],
    ];
    const full = mirrorPoints(half);
    expect(full).toEqual([
      [50, 5],
      [20, 40],
      [35, 95],
      [50, 95],
      [65, 95],
      [80, 40],
    ]);
    expect(selfIntersects(full)).toBe(false);
  });
});

describe("fitToBox / simplify", () => {
  it("fills the box keeping proportions", () => {
    const pts = fitToBox([
      [0, 0],
      [200, 0],
      [200, 100],
      [0, 100],
    ]);
    expect(pts).toEqual([
      [4, 27],
      [96, 27],
      [96, 73],
      [4, 73],
    ]);
  });

  it("drops points along straight sides", () => {
    const dense: Pt[] = [];
    for (let x = 10; x <= 90; x += 5) dense.push([x, 10]);
    for (let y = 15; y <= 90; y += 5) dense.push([90, y]);
    for (let x = 85; x >= 10; x -= 5) dense.push([x, 90]);
    for (let y = 85; y >= 15; y -= 5) dense.push([10, y]);
    const s = simplify(dense, 0.5);
    expect(s.length).toBe(4);
  });
});

/** A w×h mask with a filled disc, plus a stray speck. */
function discMask(w: number, h: number) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if ((x - 32) ** 2 + (y - 32) ** 2 <= 20 ** 2) m[y * w + x] = 1;
  m[2 * w + 60] = 1; // speck, ignored
  return m;
}

describe("tracing", () => {
  it("follows the outside of the biggest region", () => {
    const pts = traceMask(discMask(64, 64), 64, 64);
    expect(pts.length).toBeGreaterThan(8);
    const area = Math.abs(polygonArea(pts));
    expect(area).toBeGreaterThan(Math.PI * 19 ** 2);
    expect(area).toBeLessThan(Math.PI * 22 ** 2);
    expect(selfIntersects(pts)).toBe(false);
  });

  it("turns an image into a valid pin outline", () => {
    const w = 64;
    const h = 64;
    const rgba = new Uint8ClampedArray(w * h * 4).fill(255); // white, opaque
    const m = discMask(w, h);
    for (let i = 0; i < w * h; i++)
      if (m[i]) {
        rgba[i * 4] = 0;
        rgba[i * 4 + 1] = 0;
        rgba[i * 4 + 2] = 0;
      }
    const traced = traceImage(rgba, w, h, { detail: 0.6 });
    expect(traced).not.toBeNull();
    expect(checkShapePath(traced!.path).ok).toBe(true);
    expect(outlineProblems(traced!.points)).toEqual([]);
  });

  it("uses transparency when the image has it", () => {
    const w = 64;
    const h = 64;
    const rgba = new Uint8ClampedArray(w * h * 4); // all transparent
    const m = discMask(w, h);
    for (let i = 0; i < w * h; i++) if (m[i]) rgba.set([250, 250, 250, 255], i * 4); // light but opaque
    const traced = traceImage(rgba, w, h);
    expect(traced).not.toBeNull();
    expect(checkShapePath(traced!.path).ok).toBe(true);
  });

  it("returns nothing for an empty image", () => {
    expect(traceImage(new Uint8ClampedArray(16 * 16 * 4).fill(255), 16, 16)).toBeNull();
  });
});

describe("pathToPoints", () => {
  it("reopens straight and smooth outlines it made", () => {
    expect(pathToPoints(pointsToPath(square))).toEqual({ points: square, smooth: false });
    expect(pathToPoints(pointsToPath(square, true))).toEqual({ points: square, smooth: true });
  });

  it("can't reopen arcs or several outlines", () => {
    expect(pathToPoints("M50 4 A46 46 0 1 1 49.99 4 Z")).toBeNull();
    expect(pathToPoints("M1 1 L9 1 L5 9 Z M20 20 L30 20 L25 30 Z")).toBeNull();
  });
});

describe("points with their own corner / smooth setting", () => {
  const mixed: Node[] = [
    { x: 50, y: 6, smooth: false },
    { x: 85, y: 40, smooth: true },
    { x: 70, y: 92, smooth: true },
    { x: 30, y: 92, smooth: false },
    { x: 15, y: 40, smooth: true },
  ];

  it("writes a valid pin outline", () => {
    expect(checkShapePath(nodesToPath(mixed)).ok).toBe(true);
  });

  it("reads back exactly the points and their settings", () => {
    expect(pathToNodes(nodesToPath(mixed))).toEqual(mixed);
  });

  it("round-trips all-corner and all-smooth outlines", () => {
    const corners = square.map(([x, y]) => ({ x, y, smooth: false }));
    const curves = square.map(([x, y]) => ({ x, y, smooth: true }));
    expect(pathToNodes(nodesToPath(corners))).toEqual(corners);
    expect(pathToNodes(nodesToPath(curves))).toEqual(curves);
  });

  it("reads shapes saved before per-point settings existed", () => {
    expect(pathToNodes(pointsToPath(square, true))).toEqual(
      square.map(([x, y]) => ({ x, y, smooth: true })),
    );
  });

  it("flips without crossing itself and flips back to the start", () => {
    const flipped = flipNodes(mixed, "x");
    expect(selfIntersects(flipped.map((p) => [p.x, p.y] as Pt))).toBe(false);
    expect(flipNodes(flipped, "x")).toEqual(mixed);
  });
});

describe("freehandToNodes", () => {
  it("turns a hand-drawn loop into a few smooth points", () => {
    const loop: Pt[] = [];
    for (let k = 0; k < 120; k++) {
      const t = (k / 120) * 2 * Math.PI;
      loop.push([50 + 35 * Math.cos(t) + Math.sin(k) * 0.3, 50 + 35 * Math.sin(t)]);
    }
    const nodes = freehandToNodes(loop);
    expect(nodes.length).toBeGreaterThan(5);
    expect(nodes.length).toBeLessThan(40);
    expect(nodes.every((p) => p.smooth)).toBe(true);
    expect(checkShapePath(nodesToPath(nodes)).ok).toBe(true);
  });

  it("ignores a tap", () => {
    expect(
      freehandToNodes([
        [10, 10],
        [10.1, 10.1],
      ]),
    ).toEqual([]);
  });
});
