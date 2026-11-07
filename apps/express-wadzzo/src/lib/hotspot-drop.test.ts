import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { dropDueHotspots } from "./hotspot-drop";

const DAY = 86_400_000;
const at = (iso: string) => new Date(iso);

type Hotspot = {
  id: string;
  creatorId: string;
  platformId: string;
  isActive: boolean;
  hidden: boolean;
  dropEveryDays: number;
  pinDurationDays: number;
  hotspotStartDate: Date;
  hotspotEndDate: Date;
  createdAt: Date;
  autoCollect: boolean;
  shape: string;
  geoJson: unknown;
};

type Group = {
  id: string;
  hotspotId: string;
  hidden: boolean;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  locations: number;
  title: string;
};

const circle = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: { center: [40.7, -74], radiusMetres: 300 },
};

function hotspot(over: Partial<Hotspot> = {}): Hotspot {
  return {
    id: "h1",
    creatorId: "brand",
    platformId: "wadzzo",
    isActive: true,
    hidden: false,
    dropEveryDays: 2,
    pinDurationDays: 1,
    hotspotStartDate: at("2026-11-01T00:00:00Z"),
    hotspotEndDate: at("2026-11-30T00:00:00Z"),
    createdAt: at("2026-11-01T00:00:00Z"),
    autoCollect: false,
    shape: "circle",
    geoJson: circle,
    ...over,
  };
}

function group(over: Partial<Group> = {}): Group {
  return {
    id: `g${Math.random()}`,
    hotspotId: "h1",
    hidden: false,
    startDate: at("2026-11-01T00:00:00Z"),
    endDate: at("2026-11-02T00:00:00Z"),
    createdAt: at("2026-11-01T00:00:00Z"),
    locations: 3,
    title: "Free coffee",
    ...over,
  };
}

/** Just enough of the database for the drop code, kept in memory. */
function fakeDb(hotspots: Hotspot[], groups: Group[], failFor: string[] = []) {
  const created: { hotspotId: string; locations: number; startDate: Date }[] = [];
  const byCreated = (a: Group, b: Group) => a.startDate.getTime() - b.startDate.getTime();
  const db = {
    hotspot: {
      findMany: async ({ where }: { where: { isActive: boolean; hidden: boolean } }) =>
        hotspots.filter((h) => h.isActive === where.isActive && h.hidden === where.hidden),
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (failFor.includes(where.id)) throw new Error("database blinked");
        return hotspots.find((h) => h.id === where.id) ?? null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Hotspot> }) =>
        Object.assign(
          hotspots.find((h) => h.id === where.id)!,
          data,
        ),
    },
    locationGroup: {
      findMany: async ({ where }: { where: { hotspotId: string; hidden?: boolean } }) =>
        groups
          .filter(
            (g) =>
              g.hotspotId === where.hotspotId &&
              (where.hidden === undefined || g.hidden === where.hidden),
          )
          .sort(byCreated)
          .map((g) => ({ ...g, _count: { locations: g.locations } })),
      findFirst: async ({ where }: { where: { hotspotId: string; hidden?: boolean } }) => {
        const found = groups
          .filter(
            (g) =>
              g.hotspotId === where.hotspotId &&
              (where.hidden === undefined || g.hidden === where.hidden),
          )
          .sort((a, b) => byCreated(b, a))[0];
        return found
          ? { ...found, creatorId: "brand", _count: { locations: found.locations } }
          : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Group> }) =>
        Object.assign(
          groups.find((g) => g.id === where.id)!,
          data,
        ),
      create: async ({
        data,
      }: {
        data: {
          hotspotId: string;
          startDate: Date;
          endDate: Date;
          title: string;
          locations: { createMany: { data: unknown[] } };
        };
      }) => {
        const made = group({
          hotspotId: data.hotspotId,
          startDate: data.startDate,
          endDate: data.endDate,
          createdAt: data.startDate,
          title: data.title,
          locations: data.locations.createMany.data.length,
        });
        groups.push(made);
        created.push({
          hotspotId: made.hotspotId,
          locations: made.locations,
          startDate: made.startDate,
        });
        return made;
      },
    },
  };
  return { db: db as unknown as PrismaClient, created };
}

describe("dropDueHotspots: the worker's look at every hotspot", () => {
  it("drops once for a slot that has come, copying the pin count of the last drop", async () => {
    const groups = [group({ locations: 4 })];
    const { db, created } = fakeDb([hotspot()], groups);
    const summary = await dropDueHotspots(db, at("2026-11-03T00:02:00Z"));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ hotspotId: "h1", locations: 4 });
    expect(created[0]!.startDate).toEqual(at("2026-11-03T00:02:00Z"));
    expect(summary).toMatchObject({ checked: 1, dropped: 1, released: 0, ended: 0, failed: 0 });
  });

  it("looking again, now or minutes later, does not drop a second time", async () => {
    const groups = [group()];
    const { db, created } = fakeDb([hotspot()], groups);
    await dropDueHotspots(db, at("2026-11-03T00:02:00Z"));
    await dropDueHotspots(db, at("2026-11-03T00:02:00Z"));
    await dropDueHotspots(db, at("2026-11-03T00:07:00Z"));
    await dropDueHotspots(db, at("2026-11-04T23:55:00Z"));
    expect(created).toHaveLength(1);
  });

  it("drops again at the next slot, and the slots do not drift", async () => {
    const groups = [group()];
    const { db, created } = fakeDb([hotspot()], groups);
    await dropDueHotspots(db, at("2026-11-03T00:04:00Z")); // 4 minutes late
    await dropDueHotspots(db, at("2026-11-05T00:01:00Z")); // Nov 5 slot, not Nov 5 00:04
    await dropDueHotspots(db, at("2026-11-05T00:06:00Z"));
    expect(created.map((c) => c.startDate.toISOString())).toEqual([
      "2026-11-03T00:04:00.000Z",
      "2026-11-05T00:01:00.000Z",
    ]);
  });

  it("leaves a paused or deleted hotspot alone", async () => {
    const { db, created } = fakeDb(
      [hotspot({ id: "h1", isActive: false }), hotspot({ id: "h2", hidden: true })],
      [group({ hotspotId: "h1" }), group({ hotspotId: "h2" })],
    );
    const summary = await dropDueHotspots(db, at("2026-11-09T00:00:00Z"));
    expect(created).toHaveLength(0);
    expect(summary.checked).toBe(0);
  });

  it("closes a hotspot whose end date has passed, and drops nothing for it", async () => {
    const hotspots = [hotspot({ hotspotEndDate: at("2026-11-04T00:00:00Z") })];
    const { db, created } = fakeDb(hotspots, [group()]);
    const summary = await dropDueHotspots(db, at("2026-11-06T00:00:00Z"));
    expect(hotspots[0]!.isActive).toBe(false);
    expect(created).toHaveLength(0);
    expect(summary.ended).toBe(1);
  });

  it("releases the first drop of a hotspot that starts later, when its start arrives", async () => {
    const start = at("2026-12-01T00:00:00Z");
    const hotspots = [
      hotspot({ hotspotStartDate: start, hotspotEndDate: at("2026-12-31T00:00:00Z") }),
    ];
    const waiting = group({
      hidden: true,
      startDate: start,
      createdAt: at("2026-11-01T00:00:00Z"),
      endDate: at("2026-12-02T00:00:00Z"),
    });
    const { db, created } = fakeDb(hotspots, [waiting]);

    const early = await dropDueHotspots(db, at("2026-11-20T00:00:00Z"));
    expect(waiting.hidden).toBe(true);
    expect(early).toMatchObject({ released: 0, dropped: 0 });

    const onTime = await dropDueHotspots(db, at("2026-12-01T00:03:00Z"));
    expect(waiting.hidden).toBe(false);
    expect(waiting.startDate).toEqual(at("2026-12-01T00:03:00Z"));
    expect(waiting.endDate).toEqual(at("2026-12-02T00:03:00Z"));
    expect(onTime).toMatchObject({ released: 1, dropped: 0 });

    // The release counts as the first drop: no second one the same cycle.
    await dropDueHotspots(db, at("2026-12-01T00:08:00Z"));
    expect(created).toHaveLength(0);
  });

  it("one hotspot failing doesn't stop the others, and is reported", async () => {
    const { db, created } = fakeDb(
      [hotspot({ id: "h1" }), hotspot({ id: "h2" })],
      [group({ hotspotId: "h1" }), group({ hotspotId: "h2" })],
      ["h1"],
    );
    const summary = await dropDueHotspots(db, at("2026-11-03T00:02:00Z"));
    expect(created.map((c) => c.hotspotId)).toEqual(["h2"]);
    expect(summary).toMatchObject({ dropped: 1, failed: 1 });
    expect(summary.errors[0]).toMatch(/h1.*database blinked/);
  });

  it("a slot missed while the worker was down gets one catch-up drop, not one per missed slot", async () => {
    const { db, created } = fakeDb([hotspot()], [group()]);
    await dropDueHotspots(db, at("2026-11-13T06:00:00Z")); // 12 days later → slot Nov 13
    expect(created).toHaveLength(1);
    expect(DAY).toBe(86_400_000);
  });
});
