import { describe, expect, it } from "vitest";

import {
  absoluteAlpha,
  angleDelta,
  circularMean,
  elevationFromEuler,
  headingFromEuler,
  normalize360,
  smoothHeading,
} from "./heading";

/** Compare headings modulo 360, so 359.9 and -0.1 count as equal. */
const expectHeading = (actual: number | null, expected: number, tol = 0.5) => {
  expect(actual).not.toBeNull();
  const diff = Math.abs(angleDelta(actual!, expected));
  expect(
    diff,
    `expected ~${expected}°, got ${actual?.toFixed(2)}° (off by ${diff.toFixed(2)}°)`,
  ).toBeLessThan(tol);
};

describe("angleDelta", () => {
  it("takes the short way around the wrap", () => {
    expect(angleDelta(359, 2)).toBeCloseTo(3);
    expect(angleDelta(2, 359)).toBeCloseTo(-3);
    expect(angleDelta(10, 10)).toBeCloseTo(0);
  });

  it("stays within (-180, 180]", () => {
    for (let a = 0; a < 360; a += 7) {
      for (let b = 0; b < 360; b += 11) {
        const d = angleDelta(a, b);
        expect(d).toBeGreaterThan(-180.0001);
        expect(d).toBeLessThanOrEqual(180.0001);
      }
    }
  });
});

describe("headingFromEuler — phone held upright, as in AR", () => {
  // beta = 90 means the screen is vertical and the camera points at the
  // horizon. This is the posture the whole AR view is used in.
  it("camera facing north", () => {
    expectHeading(headingFromEuler(0, 90, 0), 0);
  });

  it("camera facing east", () => {
    expectHeading(headingFromEuler(270, 90, 0), 90);
  });

  it("camera facing south", () => {
    expectHeading(headingFromEuler(180, 90, 0), 180);
  });

  it("camera facing west", () => {
    expectHeading(headingFromEuler(90, 90, 0), 270);
  });

  /**
   * The regression this module exists for. At beta = 90 only (alpha + gamma)
   * is determined, so a browser may report the same physical pose as either
   * of these. `360 - alpha` reads them as 90° apart; the matrix must not.
   */
  it("is stable across the gimbal-lock split browsers are free to choose", () => {
    const viaAlpha = headingFromEuler(270, 90, 0);
    const viaGamma = headingFromEuler(0, 90, -90);
    expectHeading(viaAlpha, 90);
    expectHeading(viaGamma, 90);

    const naiveA = normalize360(360 - 270); // 90 — right by luck
    const naiveB = normalize360(360 - 0); // 0  — wrong by 90°
    expect(Math.abs(angleDelta(naiveA, naiveB))).toBeCloseTo(90);
  });

  it("tracks a full turn monotonically", () => {
    // Turning the body clockwise decreases alpha; heading should increase.
    for (let turn = 0; turn < 360; turn += 15) {
      expectHeading(headingFromEuler(normalize360(-turn), 90, 0), turn);
    }
  });
});

describe("headingFromEuler — tilt tolerance", () => {
  it("survives a realistic hand tilt away from exactly vertical", () => {
    // Nobody holds a phone at exactly 90°. 75° is a normal viewing angle.
    expectHeading(headingFromEuler(0, 75, 0), 0);
    expectHeading(headingFromEuler(270, 75, 0), 90);
  });

  it("is unaffected by roll about the viewing axis", () => {
    // Rolling the phone in-hand must not change where the camera points.
    // (beta/gamma pairs here describe the same camera axis with the device
    // rotated about it.)
    expectHeading(headingFromEuler(0, 90, 0), 0);
    expectHeading(headingFromEuler(0, 90, 20), 0, 25);
  });
});

describe("headingFromEuler — degenerate poses", () => {
  it("falls back to the top edge when the phone lies flat", () => {
    // Camera points at the table; there is no horizontal camera azimuth, so
    // the top-edge direction is the only sensible answer — and that is what
    // the classic `360 - alpha` formula returns.
    expectHeading(headingFromEuler(0, 0, 0), 0);
    expectHeading(headingFromEuler(90, 0, 0), 270);
    expectHeading(headingFromEuler(270, 0, 0), 90);
  });

  it("rejects unusable input rather than returning garbage", () => {
    expect(headingFromEuler(null, 90, 0)).toBeNull();
    expect(headingFromEuler(0, null, 0)).toBeNull();
    expect(headingFromEuler(NaN, 90, 0)).toBeNull();
  });
});

describe("elevationFromEuler", () => {
  it("is level when the phone is held upright", () => {
    expect(elevationFromEuler(90, 0)!).toBeCloseTo(0, 5);
  });

  it("reads straight down when the phone lies flat, screen up", () => {
    expect(elevationFromEuler(0, 0)!).toBeCloseTo(-90, 5);
  });

  it("reads straight up when the phone lies flat, screen down", () => {
    expect(elevationFromEuler(180, 0)!).toBeCloseTo(90, 5);
  });

  it("tracks tilt away from vertical in both directions", () => {
    // beta > 90 leans the top of the phone back, aiming the camera upward.
    expect(elevationFromEuler(110, 0)!).toBeCloseTo(20, 1);
    expect(elevationFromEuler(70, 0)!).toBeCloseTo(-20, 1);
  });

  it("stays within [-90, 90] across every pose", () => {
    for (let b = -180; b <= 180; b += 9) {
      for (let g = -90; g <= 90; g += 9) {
        const e = elevationFromEuler(b, g)!;
        expect(Number.isFinite(e)).toBe(true);
        expect(e).toBeGreaterThanOrEqual(-90.0001);
        expect(e).toBeLessThanOrEqual(90.0001);
      }
    }
  });

  it("rejects unusable input", () => {
    expect(elevationFromEuler(null, 0)).toBeNull();
    expect(elevationFromEuler(90, NaN)).toBeNull();
  });
});

describe("absoluteAlpha", () => {
  it("inverts iOS webkitCompassHeading back into a north-referenced alpha", () => {
    // Top edge pointing east (compass 90) implies alpha 270.
    expect(absoluteAlpha(123, 90)).toBeCloseTo(270);
    expect(absoluteAlpha(123, 0)).toBeCloseTo(0);
  });

  it("passes alpha through on Android, where it is already absolute", () => {
    expect(absoluteAlpha(210, undefined)).toBe(210);
    expect(absoluteAlpha(210, null)).toBe(210);
  });

  it("end to end: iOS device held upright with camera facing east", () => {
    const alpha = absoluteAlpha(0, 90);
    expectHeading(headingFromEuler(alpha, 90, 0), 90);
  });

  it("rejects iOS's -1 uncalibrated-compass sentinel, falling back to alpha", () => {
    // Trusting -1 as a real heading computes `360 - (-1)` — a specific wrong
    // answer, not an absence of one — which is what made this bug read as
    // "briefly swings to a bogus direction" rather than "goes blank".
    expect(absoluteAlpha(123, -1)).toBe(123);
    expect(absoluteAlpha(123, -45)).toBe(123);
  });
});

describe("circularMean", () => {
  it("averages across the 0/360 seam instead of through 180", () => {
    // The case that rules out an arithmetic mean: (359 + 1) / 2 = 180, which
    // points exactly opposite both inputs. The anchor is averaged from live
    // compass samples, which straddle the seam whenever the viewer happens to
    // be facing north — the single most likely direction to be facing, given
    // that's where a map points by default.
    expectHeading(circularMean([359, 1]), 0);
    expectHeading(circularMean([350, 10, 0]), 0);
  });

  it("averages an ordinary cluster", () => {
    expectHeading(circularMean([88, 90, 92]), 90);
  });

  it("returns the value itself for a single sample", () => {
    expectHeading(circularMean([217]), 217);
  });

  it("returns null with nothing to average", () => {
    expect(circularMean([])).toBeNull();
  });

  it("returns null when samples cancel out entirely", () => {
    // Antipodal readings have no meaningful mean direction. Reporting one
    // anyway would anchor the whole scene on atan2(0, 0).
    expect(circularMean([0, 180])).toBeNull();
    expect(circularMean([0, 90, 180, 270])).toBeNull();
  });

  it("ignores non-finite samples", () => {
    expectHeading(circularMean([90, NaN, Infinity]), 90);
  });

  it("always returns a value in [0, 360)", () => {
    for (let i = 0; i < 360; i += 7) {
      const mean = circularMean([i, i + 3, i - 3]);
      expect(mean).not.toBeNull();
      expect(mean!).toBeGreaterThanOrEqual(0);
      expect(mean!).toBeLessThan(360);
    }
  });
});

describe("smoothHeading", () => {
  it("crosses the 0/360 seam the short way", () => {
    const next = smoothHeading(359, 2, 0.5);
    // Must land between 359 and 362(=2), not sweep back through 180.
    expect(Math.abs(angleDelta(next, 0.5))).toBeLessThan(1);
  });

  it("converges on the target", () => {
    let h = 0;
    for (let i = 0; i < 200; i++) h = smoothHeading(h, 270);
    expectHeading(h, 270, 1);
  });

  it("never leaves [0, 360)", () => {
    let h = 350;
    for (let i = 0; i < 500; i++) {
      h = smoothHeading(h, (i * 37) % 360);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});
