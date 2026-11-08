import { describe, expect, it } from "vitest";

import { BUILTIN_SHAPES } from "../pin-look";
import {
  flattenPath,
  markerScale,
  MAX_MARKER_SCALE,
  pathCoverage,
  THIN_SHAPE_COVERAGE,
} from "../shape-size";

describe("pathCoverage", () => {
  // Measured by rendering each shape and counting its pixels.
  it.each([
    ["circle", 0.66],
    ["square", 0.83],
    ["hexagon", 0.55],
    ["shield", 0.6],
    ["star", 0.31],
    ["teardrop", 0.49],
  ] as const)("reads the %s's share of its box", (id, share) => {
    expect(pathCoverage(BUILTIN_SHAPES[id].path)).toBeCloseTo(share, 1);
  });

  it("reads straight lines, h/v moves, curves and arcs", () => {
    expect(pathCoverage("M0 0 L100 0 L100 100 L0 100 Z")).toBe(1);
    expect(pathCoverage("M0 0 H100 V100 H0 Z")).toBe(1);
    // A half-width bar.
    expect(pathCoverage("M0 25 L100 25 L100 75 L0 75 Z")).toBeCloseTo(0.5, 5);
    // A circle drawn by an arc: π·50² / 10000.
    expect(pathCoverage("M50 0 A50 50 0 1 1 49.99 0 Z")).toBeCloseTo(Math.PI * 0.25, 2);
    // A quadratic bulge is two thirds of its bounding rectangle.
    expect(pathCoverage("M0 100 Q50 -100 100 100 Z")).toBeCloseTo(
      ((2 / 3) * 100 * 100) / 10_000,
      2,
    );
  });

  it("is small for a thin cross and zero for something unreadable", () => {
    const cross =
      "M44 0 L56 0 L56 44 L100 44 L100 56 L56 56 L56 100 L44 100 L44 56 L0 56 L0 44 L44 44 Z";
    expect(pathCoverage(cross)).toBeLessThan(THIN_SHAPE_COVERAGE);
    expect(pathCoverage("")).toBe(0);
    expect(pathCoverage("m10 10 l5 5 z")).toBe(0); // relative commands aren't used here
    expect(flattenPath("not a path")).toBeNull();
  });
});

describe("markerScale", () => {
  it("leaves a shape that fills well at the usual size", () => {
    expect(markerScale(0.83)).toBe(1);
    expect(markerScale(0.66)).toBe(1);
  });

  it("makes thin shapes larger, but never by more than the cap", () => {
    expect(markerScale(0.4)).toBeGreaterThan(1.1);
    expect(markerScale(0.31)).toBeGreaterThan(markerScale(0.4));
    expect(markerScale(0.22)).toBe(MAX_MARKER_SCALE);
    expect(markerScale(0.01)).toBe(MAX_MARKER_SCALE);
  });

  it("does nothing for a shape it can't measure", () => {
    expect(markerScale(0)).toBe(1);
    expect(markerScale(Number.NaN)).toBe(1);
  });
});
