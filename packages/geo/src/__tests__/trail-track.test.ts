import { describe, expect, it } from "vitest";

import {
  bearingDegrees,
  compassPoint,
  cutTrack,
  fitPoints,
  metresOffPath,
  parseGpx,
  simplifyLine,
} from "../trail-track";

// A track heading north along lng 90.4, about 111 m per 0.001° of latitude.
const track: [number, number][] = Array.from({ length: 21 }, (_, i) => [90.4, 23.8 + i * 0.001]);
const at = (lat: number, lng = 90.4) => ({ lat, lng });

describe("parseGpx", () => {
  it("reads track points in order, any attribute order and namespace", () => {
    const xml = `<?xml version="1.0"?><gpx><trk><trkseg>
      <trkpt lat="23.8" lon="90.4"><ele>5</ele></trkpt>
      <trkpt lon='90.401' lat='23.801'/>
      </trkseg><trkseg><gpx:trkpt lat="23.802" lon="90.402"></gpx:trkpt></trkseg></trk></gpx>`;
    expect(parseGpx(xml)).toEqual([
      [90.4, 23.8],
      [90.401, 23.801],
      [90.402, 23.802],
    ]);
  });
  it("falls back to the route, and skips bad points", () => {
    const xml = `<gpx><rte><rtept lat="1" lon="2"/><rtept lat="x" lon="3"/><rtept lat="4" lon="5"/></rte></gpx>`;
    expect(parseGpx(xml)).toEqual([
      [2, 1],
      [5, 4],
    ]);
    expect(parseGpx("<gpx></gpx>")).toEqual([]);
  });
});

describe("simplifyLine / fitPoints", () => {
  it("drops points on a straight line, keeps the ends and a real bend", () => {
    expect(simplifyLine(track, 1)).toEqual([track[0], track[20]]);
    const bent: [number, number][] = [...track.slice(0, 11), [90.41, 23.81], ...track.slice(11)];
    expect(simplifyLine(bent, 5)).toContainEqual([90.41, 23.81]);
  });
  it("fits a long wiggly line under the cap", () => {
    const wiggle = Array.from(
      { length: 5000 },
      (_, i) => [90.4 + (i % 2) * 0.00002, 23.8 + i * 0.0001] as [number, number],
    );
    expect(fitPoints(wiggle, 2000).length).toBeLessThanOrEqual(2000);
  });
});

describe("cutTrack", () => {
  it("cuts one section per pair of stops, following the track", () => {
    const [a, b] = cutTrack(track, [at(23.8), at(23.805, 90.4003), at(23.82)]);
    expect(a![0]).toEqual([90.4, 23.8]);
    expect(a!.at(-1)).toEqual([90.4003, 23.805]);
    expect(a!.length).toBeGreaterThan(3);
    expect(b![0]).toEqual([90.4003, 23.805]);
    expect(b!.at(-1)).toEqual([90.4, 23.82]);
  });
  it("works when the stops run against the track", () => {
    const [a] = cutTrack(track, [at(23.815), at(23.805)]);
    expect(a![0]).toEqual([90.4, 23.815]);
    expect(a!.length).toBeGreaterThan(3);
  });
  it("leaves a section null when a stop is far off the track", () => {
    const [a, b] = cutTrack(track, [at(23.8), at(23.81, 90.43), at(23.82)]);
    expect(a).toBeNull();
    expect(b).toBeNull();
  });
  it("cuts a loop that starts and ends at the same place", () => {
    const loop: [number, number][] = [...track, [90.41, 23.82], [90.41, 23.8], [90.4, 23.8]];
    const [a, b] = cutTrack(loop, [at(23.8), at(23.82), at(23.8)]);
    expect(a!.length).toBeGreaterThan(10);
    expect(b).toContainEqual([90.41, 23.8]);
  });
});

describe("compass helpers", () => {
  it("gives bearings and compass points", () => {
    expect(Math.round(bearingDegrees(at(23.8), at(23.81)))).toBe(0);
    expect(Math.round(bearingDegrees(at(23.8), at(23.8, 90.41)))).toBe(90);
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(225)).toBe("SW");
    expect(compassPoint(350)).toBe("N");
  });
  it("measures how far off the path a point is", () => {
    expect(metresOffPath([track], at(23.81))).toBeLessThan(1);
    expect(Math.round(metresOffPath([track], at(23.81, 90.401)))).toBeGreaterThan(90);
    expect(metresOffPath([], at(23.81))).toBe(Infinity);
  });
});
