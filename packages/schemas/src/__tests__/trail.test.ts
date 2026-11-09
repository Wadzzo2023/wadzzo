import { describe, expect, it } from "vitest";

import {
  orderLockReason,
  readStopDefaults,
  saveTrailSchema,
  submitProblems,
  trailProgress,
  type ProgressStop,
} from "../trail";

const stops = (done: boolean[], required = done.map(() => true)): ProgressStop[] =>
  done.map((d, i) => ({ position: i + 1, done: d, required: required[i]! }));

const base = {
  title: "Coffee trail",
  startDate: "2026-11-10T00:00:00Z",
  endDate: "2026-12-10T00:00:00Z",
  stops: [{ pinId: "a" }, { pinId: "b" }],
  path: [
    [
      [90.4, 23.8],
      [90.41, 23.81],
    ],
  ],
};

describe("saveTrailSchema", () => {
  it("accepts a two-stop trail with defaults filled in", () => {
    const t = saveTrailSchema.parse(base);
    expect(t.mode).toBe("WALK");
    expect(t.order).toBe("ORDERED");
    expect(t.stops[0]!.required).toBe(true);
  });

  it("refuses the same pin twice", () => {
    const r = saveTrailSchema.safeParse({ ...base, stops: [{ pinId: "a" }, { pinId: "a" }] });
    expect(r.success).toBe(false);
  });

  it("refuses a path that doesn't match the stops", () => {
    const r = saveTrailSchema.safeParse({ ...base, stops: [...base.stops, { pinId: "c" }] });
    expect(r.success).toBe(false);
  });

  it("allows a draft without a path", () => {
    expect(saveTrailSchema.safeParse({ ...base, path: [] }).success).toBe(true);
  });

  it("refuses an end before the start", () => {
    const r = saveTrailSchema.safeParse({ ...base, endDate: "2026-11-01T00:00:00Z" });
    expect(r.success).toBe(false);
  });

  it("refuses a reward that needs more stops than are required", () => {
    const r = saveTrailSchema.safeParse({
      ...base,
      reward: { assetId: 1, limit: 10, minStops: 3 },
    });
    expect(r.success).toBe(false);
  });

  it("refuses more than 25 stops", () => {
    const many = Array.from({ length: 26 }, (_, i) => ({ pinId: `p${i}` }));
    expect(saveTrailSchema.safeParse({ ...base, stops: many, path: [] }).success).toBe(false);
  });
});

describe("submitProblems", () => {
  const end = new Date(Date.now() + 86_400_000);
  it("lists what's missing", () => {
    expect(submitProblems({ stops: [{ required: true }], path: [], endDate: end })).toContain(
      "Add at least 2 stops",
    );
    expect(
      submitProblems({ stops: [{ required: true }, { required: true }], path: [], endDate: end }),
    ).toContain("Draw the path between every stop");
  });
  it("is empty for a complete trail", () => {
    expect(
      submitProblems({
        stops: [{ required: true }, { required: false }],
        path: [[]],
        endDate: end,
      }),
    ).toEqual([]);
  });
});

describe("trailProgress", () => {
  it("counts done stops and finds the next", () => {
    const p = trailProgress(stops([true, false, true]));
    expect(p).toMatchObject({ done: 2, total: 3, next: 2, complete: false });
  });

  it("is complete when every required stop is done", () => {
    const p = trailProgress(stops([true, false, true], [true, false, true]));
    expect(p.complete).toBe(true);
    expect(p.next).toBe(2);
  });

  it("honours N of M", () => {
    expect(trailProgress(stops([true, true, false, false]), 2).complete).toBe(true);
    expect(trailProgress(stops([true, false, false, false]), 2).complete).toBe(false);
  });

  it("is never complete without required stops", () => {
    expect(trailProgress(stops([true], [false])).complete).toBe(false);
  });
});

describe("orderLockReason", () => {
  it("locks a stop behind a missing earlier required stop", () => {
    expect(orderLockReason(stops([false, false]), 2, "ORDERED")).toBe("Collect stop 1 first");
  });
  it("doesn't lock the first stop or an any-order trail", () => {
    expect(orderLockReason(stops([false, false]), 1, "ORDERED")).toBeNull();
    expect(orderLockReason(stops([false, false]), 2, "ANY")).toBeNull();
  });
  it("skips optional stops both ways", () => {
    const s = stops([false, false, false], [false, true, true]);
    expect(orderLockReason(s, 1, "ORDERED")).toBeNull();
    expect(orderLockReason(s, 2, "ORDERED")).toBeNull();
    expect(orderLockReason(s, 3, "ORDERED")).toBe("Collect stop 2 first");
  });
});

describe("readStopDefaults", () => {
  it("keeps valid fields and drops title, location and bad values", () => {
    const d = readStopDefaults({
      title: "x",
      location: { lat: 1, lng: 2 },
      type: "LANDMARK",
      pinCollectionLimit: -5,
      autoCollect: true,
    });
    expect(d).toEqual({ type: "LANDMARK", autoCollect: true });
  });
});
