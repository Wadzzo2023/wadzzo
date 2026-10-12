import { describe, expect, it } from "vitest";

import {
  dueCue,
  formatNavDistance,
  indexRoute,
  progressAt,
  snapToRoute,
  splitRoute,
} from "./navigation";
import type { Route } from "./useDirections";

// An L-shaped route in Dhaka: ~111 m north, then ~102 m east.
const A: [number, number] = [90.4, 23.78];
const B: [number, number] = [90.4, 23.781];
const C: [number, number] = [90.401, 23.781];
const route: Route = {
  id: "walking-0",
  distance: 213,
  duration: 180,
  coordinates: [A, B, C],
  profile: "walking",
  summary: "Test Road",
  steps: [
    {
      instruction: "Head north",
      banner: "Test Road",
      type: "depart",
      distance: 111,
      duration: 90,
      name: "Test Road",
      location: A,
      voice: [
        { distanceAlong: 100, text: "In 100 metres, turn right" },
        { distanceAlong: 20, text: "Turn right" },
      ],
    },
    {
      instruction: "Turn right",
      banner: "East Road",
      type: "turn",
      modifier: "right",
      distance: 102,
      duration: 90,
      name: "East Road",
      location: B,
      voice: [],
    },
    {
      instruction: "You have arrived",
      banner: "",
      type: "arrive",
      distance: 0,
      duration: 0,
      name: "",
      location: C,
      voice: [],
    },
  ],
};

describe("navigation", () => {
  const index = indexRoute(route);

  it("measures the route and where each step starts", () => {
    expect(index.total).toBeGreaterThan(205);
    expect(index.total).toBeLessThan(220);
    expect(index.stepStart[1]).toBeCloseTo(index.cum[1]!, -1);
  });

  it("snaps a fix beside the first leg onto it", () => {
    const snap = snapToRoute(index, { lat: 23.7805, lng: 90.40005 })!;
    expect(snap.seg).toBe(0);
    expect(snap.off).toBeGreaterThan(3);
    expect(snap.off).toBeLessThan(8);
    expect(snap.along).toBeGreaterThan(50);
    expect(snap.along).toBeLessThan(60);
    expect(Math.round(snap.heading)).toBe(0);
  });

  it("knows the next turn and what's left", () => {
    const snap = snapToRoute(index, { lat: 23.7805, lng: 90.4 })!;
    const p = progressAt(index, route, snap.along);
    expect(p.step).toBe(0);
    expect(p.next?.modifier).toBe("right");
    expect(p.toNext).toBeGreaterThan(50);
    expect(p.toNext).toBeLessThan(60);
    expect(p.remaining).toBeGreaterThan(150);
    const { done, ahead } = splitRoute(index, snap);
    expect(done.at(-1)).toEqual(snap.point);
    expect(ahead[0]).toEqual(snap.point);
  });

  it("flags a fix far from the route", () => {
    const snap = snapToRoute(index, { lat: 23.7805, lng: 90.4006 })!;
    expect(snap.off).toBeGreaterThan(35);
  });

  it("speaks the most relevant cue once, skipping stale ones", () => {
    const spoken = new Set<string>();
    const near = progressAt(index, route, index.stepStart[1]! - 15);
    expect(dueCue(route, near, spoken)?.text).toBe("Turn right");
    expect(dueCue(route, near, spoken)).toBeNull();
  });

  it("rounds distances like a driver reads them", () => {
    expect(formatNavDistance(147)).toBe("150 m");
    expect(formatNavDistance(23)).toBe("25 m");
    expect(formatNavDistance(1234)).toBe("1.2 km");
  });
});
