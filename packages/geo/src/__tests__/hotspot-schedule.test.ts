import { describe, expect, it } from "vitest";

import {
  DAY_MS,
  START_TOLERANCE_MS,
  dropAnchor,
  hotspotAction,
  hotspotSchedule,
  isPendingFirstDrop,
  lastDueSlot,
  nextSlot,
} from "../hotspot-schedule";

const at = (iso: string) => new Date(iso);

describe("isPendingFirstDrop", () => {
  it("is a hidden drop made well before its start date", () => {
    expect(
      isPendingFirstDrop({
        hidden: true,
        startDate: at("2026-12-01T10:00:00Z"),
        createdAt: at("2026-11-01T10:00:00Z"),
      }),
    ).toBe(true);
  });

  it("is not a visible drop, nor one made right at its start", () => {
    const base = { startDate: at("2026-12-01T10:00:00Z"), createdAt: at("2026-11-01T10:00:00Z") };
    expect(isPendingFirstDrop({ ...base, hidden: false })).toBe(false);
    expect(
      isPendingFirstDrop({
        hidden: true,
        startDate: at("2026-11-01T10:00:30Z"),
        createdAt: at("2026-11-01T10:00:00Z"),
      }),
    ).toBe(false);
  });
});

describe("dropAnchor", () => {
  it("is the start date when the hotspot starts later, else the day it was made", () => {
    expect(
      dropAnchor({
        hotspotStartDate: at("2026-12-01T00:00:00Z"),
        createdAt: at("2026-11-01T00:00:00Z"),
      }),
    ).toEqual(at("2026-12-01T00:00:00Z"));
    expect(
      dropAnchor({
        hotspotStartDate: at("2026-10-01T00:00:00Z"),
        createdAt: at("2026-11-01T00:00:00Z"),
      }),
    ).toEqual(at("2026-11-01T00:00:00Z"));
  });
});

describe("drop slots: every N days from the anchor, with no drift", () => {
  const anchor = at("2026-11-01T09:30:00Z");

  it("has no slot before the anchor", () => {
    expect(lastDueSlot(anchor, 3, at("2026-11-01T09:00:00Z"))).toBeNull();
  });

  it("the anchor itself is the first slot", () => {
    expect(lastDueSlot(anchor, 3, anchor)).toEqual(anchor);
    expect(lastDueSlot(anchor, 3, at("2026-11-03T00:00:00Z"))).toEqual(anchor);
  });

  it("the latest slot never moves later or earlier because of when the check ran", () => {
    // Every 3 days from Nov 1 09:30 → Nov 4, 7, 10 at 09:30, however late the worker looked.
    expect(lastDueSlot(anchor, 3, at("2026-11-04T09:30:00Z"))).toEqual(at("2026-11-04T09:30:00Z"));
    expect(lastDueSlot(anchor, 3, at("2026-11-04T09:34:59Z"))).toEqual(at("2026-11-04T09:30:00Z"));
    expect(lastDueSlot(anchor, 3, at("2026-11-06T23:59:00Z"))).toEqual(at("2026-11-04T09:30:00Z"));
    expect(lastDueSlot(anchor, 3, at("2026-11-10T09:30:00Z"))).toEqual(at("2026-11-10T09:30:00Z"));
  });

  it("next slot is the first one after now", () => {
    expect(nextSlot(anchor, 3, at("2026-11-02T00:00:00Z"))).toEqual(at("2026-11-04T09:30:00Z"));
    expect(nextSlot(anchor, 3, at("2026-11-04T09:30:00Z"))).toEqual(at("2026-11-07T09:30:00Z"));
    expect(nextSlot(anchor, 3, at("2026-10-30T00:00:00Z"))).toEqual(anchor);
  });
});

describe("hotspotAction: what the worker should do for one hotspot right now", () => {
  const hotspot = {
    isActive: true,
    dropEveryDays: 2,
    hotspotStartDate: at("2026-11-01T00:00:00Z"),
    hotspotEndDate: at("2026-11-30T00:00:00Z"),
    createdAt: at("2026-11-01T00:00:00Z"),
  };
  const dropped = (iso: string) => ({ latestDropStart: at(iso), pendingFirstDrop: false });

  it("does nothing for a paused hotspot", () => {
    expect(
      hotspotAction(
        { ...hotspot, isActive: false },
        dropped("2026-11-01T00:00:00Z"),
        at("2026-11-09T00:00:00Z"),
      ),
    ).toBe("none");
  });

  it("closes a hotspot that has ended", () => {
    expect(
      hotspotAction(hotspot, dropped("2026-11-29T00:00:00Z"), at("2026-12-01T00:00:00Z")),
    ).toBe("end");
  });

  it("drops when a slot has passed with no drop for it", () => {
    expect(
      hotspotAction(hotspot, dropped("2026-11-01T00:00:00Z"), at("2026-11-03T00:03:00Z")),
    ).toBe("drop");
  });

  it("does not drop twice for the same slot, however often it is asked", () => {
    const now = at("2026-11-03T00:03:00Z");
    // The drop made for the Nov 3 slot, a few minutes late.
    expect(hotspotAction(hotspot, dropped("2026-11-03T00:03:00Z"), now)).toBe("none");
    expect(
      hotspotAction(hotspot, dropped("2026-11-03T00:03:00Z"), at("2026-11-03T00:08:00Z")),
    ).toBe("none");
    expect(
      hotspotAction(hotspot, dropped("2026-11-03T00:03:00Z"), at("2026-11-04T23:55:00Z")),
    ).toBe("none");
  });

  it("waits until the next slot, then drops again", () => {
    expect(
      hotspotAction(hotspot, dropped("2026-11-03T00:03:00Z"), at("2026-11-05T00:01:00Z")),
    ).toBe("drop");
  });

  it("is not early: nothing before the slot arrives", () => {
    expect(
      hotspotAction(hotspot, dropped("2026-11-01T00:00:00Z"), at("2026-11-02T23:55:00Z")),
    ).toBe("none");
  });

  it("releases the first drop of a hotspot that starts later, once its start arrives", () => {
    const later = {
      ...hotspot,
      hotspotStartDate: at("2026-12-01T00:00:00Z"),
      hotspotEndDate: at("2026-12-31T00:00:00Z"),
      createdAt: at("2026-11-01T00:00:00Z"),
    };
    const waiting = { latestDropStart: null, pendingFirstDrop: true };
    expect(hotspotAction(later, waiting, at("2026-11-20T00:00:00Z"))).toBe("none");
    expect(
      hotspotAction(
        later,
        waiting,
        new Date(later.hotspotStartDate.getTime() - START_TOLERANCE_MS - 1000),
      ),
    ).toBe("none");
    expect(hotspotAction(later, waiting, new Date(later.hotspotStartDate.getTime() - 5_000))).toBe(
      "release",
    );
    expect(hotspotAction(later, waiting, at("2026-12-01T00:04:00Z"))).toBe("release");
  });

  it("after being paused for a long time, drops once for the latest missed slot, not once per missed slot", () => {
    // Paused Nov 3 → resumed Nov 20. One catch-up drop is due, and only one.
    const now = at("2026-11-20T10:00:00Z");
    expect(hotspotAction(hotspot, dropped("2026-11-03T00:03:00Z"), now)).toBe("drop");
    // That drop (startDate = now) satisfies the Nov 19 slot.
    expect(
      hotspotAction(hotspot, dropped("2026-11-20T10:00:00Z"), at("2026-11-20T10:05:00Z")),
    ).toBe("none");
  });

  it("with no drop at all and nothing pending, drops (the hotspot lost its template drop)", () => {
    expect(
      hotspotAction(
        hotspot,
        { latestDropStart: null, pendingFirstDrop: false },
        at("2026-11-03T00:03:00Z"),
      ),
    ).toBe("drop");
  });

  it("DAY_MS is a day", () => {
    expect(DAY_MS).toBe(86_400_000);
  });
});

describe("hotspotSchedule: what the hotspot page shows as the next drop", () => {
  const hotspot = {
    isActive: true,
    dropEveryDays: 2,
    hotspotStartDate: at("2026-11-01T00:00:00Z"),
    hotspotEndDate: at("2026-11-30T00:00:00Z"),
    createdAt: at("2026-11-01T00:00:00Z"),
  };

  it("is the next slot while the hotspot runs", () => {
    expect(hotspotSchedule(hotspot, false, at("2026-11-02T00:00:00Z"))).toEqual({
      hasSchedule: true,
      nextRunTime: at("2026-11-03T00:00:00Z"),
    });
  });

  it("is the start date while the first drop is still waiting", () => {
    const later = {
      ...hotspot,
      hotspotStartDate: at("2026-12-01T00:00:00Z"),
      hotspotEndDate: at("2026-12-31T00:00:00Z"),
    };
    expect(hotspotSchedule(later, true, at("2026-11-02T00:00:00Z"))).toEqual({
      hasSchedule: true,
      nextRunTime: at("2026-12-01T00:00:00Z"),
    });
  });

  it("is nothing for a paused hotspot, an ended one, or when the next slot is past the end", () => {
    const none = { hasSchedule: false, nextRunTime: null };
    expect(
      hotspotSchedule({ ...hotspot, isActive: false }, false, at("2026-11-02T00:00:00Z")),
    ).toEqual(none);
    expect(hotspotSchedule(hotspot, false, at("2026-12-02T00:00:00Z"))).toEqual(none);
    expect(hotspotSchedule(hotspot, false, at("2026-11-29T12:00:00Z"))).toEqual(none);
  });
});
