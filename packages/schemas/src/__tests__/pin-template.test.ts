import { describe, expect, it } from "vitest";

import {
  createPinTemplateSchema,
  datesFromDays,
  datesFromMinutes,
  daysBetween,
  describeMinutes,
  minutesBetween,
  readTemplateData,
  templateHasLocation,
} from "../pin-template";

const square = {
  type: "Feature" as const,
  properties: {},
  geometry: {
    type: "Polygon" as const,
    coordinates: [
      [
        [23.81, 90.41],
        [23.81, 90.42],
        [23.82, 90.42],
        [23.82, 90.41],
        [23.81, 90.41],
      ] as [number, number][],
    ],
  },
};

describe("saving a template", () => {
  it("accepts a half-filled pin template", () => {
    const r = createPinTemplateSchema.safeParse({
      name: "Coffee",
      formType: "PIN",
      data: { title: "Free coffee" },
    });
    expect(r.success).toBe(true);
  });

  it("needs a name", () => {
    const r = createPinTemplateSchema.safeParse({ name: "  ", formType: "PIN", data: {} });
    expect(r.success).toBe(false);
  });

  it("rejects an area whose outline isn't closed", () => {
    const open = structuredClone(square);
    open.geometry.coordinates[0]!.pop();
    open.geometry.coordinates[0]!.push([23.83, 90.43]);
    const r = createPinTemplateSchema.safeParse({
      name: "Park",
      formType: "HOTSPOT",
      data: { area: { shape: "polygon", geoJson: open } },
    });
    expect(r.success).toBe(false);
  });

  it("accepts a hotspot template with its area", () => {
    const r = createPinTemplateSchema.safeParse({
      name: "Park",
      formType: "HOTSPOT",
      data: { scheduleDays: 30, area: { shape: "rectangle", geoJson: square } },
    });
    expect(r.success).toBe(true);
  });

  it("rejects a location off the globe", () => {
    const r = createPinTemplateSchema.safeParse({
      name: "X",
      formType: "PIN",
      data: { location: { lat: 123, lng: 0 } },
    });
    expect(r.success).toBe(false);
  });
});

describe("reading a saved template", () => {
  it("keeps the good fields and drops the broken ones", () => {
    const data = readTemplateData("PIN", {
      title: "Coffee",
      pinNumber: "lots",
      location: { lat: 999, lng: 0 },
      radius: 40,
    });
    expect(data).toEqual({ title: "Coffee", radius: 40 });
  });

  it("opens anything, even garbage, as an empty template", () => {
    expect(readTemplateData("PIN", null)).toEqual({});
    expect(readTemplateData("HOTSPOT", "nope")).toEqual({});
    expect(readTemplateData("PIN", [1, 2])).toEqual({});
  });

  it("ignores fields of the other kind", () => {
    expect(readTemplateData("HOTSPOT", { radius: 10, dropEveryDays: 2 })).toEqual({
      dropEveryDays: 2,
    });
  });

  it("knows whether a location or area is included", () => {
    expect(templateHasLocation("PIN", { location: { lat: 1, lng: 2 } })).toBe(true);
    expect(templateHasLocation("PIN", {})).toBe(false);
    expect(templateHasLocation("HOTSPOT", { area: { shape: "polygon", geoJson: square } })).toBe(
      true,
    );
  });
});

describe("durations", () => {
  const start = new Date("2026-11-08T10:00:00Z");

  it("round-trips minutes", () => {
    const end = new Date("2026-11-11T12:30:00Z");
    const m = minutesBetween(start, end);
    const { start: s, end: e } = datesFromMinutes(m, start);
    expect(s.getTime()).toBe(start.getTime());
    expect(e.getTime()).toBe(end.getTime());
  });

  it("never gives zero or less", () => {
    expect(minutesBetween(start, start)).toBe(1);
    expect(daysBetween(start, new Date(start.getTime() - 1000))).toBe(1);
  });

  it("round-trips days", () => {
    const { end } = datesFromDays(30, start);
    expect(daysBetween(start, end)).toBe(30);
  });

  it("reads naturally", () => {
    expect(describeMinutes(3 * 24 * 60)).toBe("3 days");
    expect(describeMinutes(26 * 60)).toBe("1 day 2 hours");
    expect(describeMinutes(90)).toBe("1 hour 30 minutes");
  });
});
