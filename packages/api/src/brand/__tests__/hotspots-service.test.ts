import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hotspots } from "../server/hotspots";

// Hotspot create / pause / resume / change / delete, against a stand-in database. They used to be
// HTTP calls to the task server; now the app writes the rows and the worker's look does the drops.

const NOW = new Date("2026-11-07T10:00:00Z");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const circle = { type: "Feature", properties: { center: [40.7, -74], radiusMetres: 300 } };

type Row = Record<string, unknown>;
function makeDb(found: Row | null = { id: "h1" }) {
  const db = {
    creator: { findUniqueOrThrow: vi.fn(async () => ({ platformId: "clintoncounty" })) },
    hotspot: {
      create: vi.fn(async (_q: { data: Row }) => ({ id: "h_new" })),
      findFirst: vi.fn(async (_q: { where: Row }) => found),
      update: vi.fn(async (_q: { where: Row; data: Row }) => ({})),
    },
    locationGroup: {
      update: vi.fn(async (_q: { where: Row; data: Row }) => ({})),
      updateMany: vi.fn(async (_q: { where: Row; data: Row }) => ({ count: 1 })),
    },
    location: { updateMany: vi.fn(async (_q: { where: Row; data: Row }) => ({ count: 1 })) },
  };
  return db;
}

const base = {
  title: "Free coffee",
  dropEveryDays: 2,
  pinDurationDays: 1,
  hotspotStartDate: NOW.toISOString(),
  hotspotEndDate: new Date(NOW.getTime() + 10 * 86_400_000).toISOString(),
  pinNumber: 3,
  pinCollectionLimit: 5,
  autoCollect: false,
  hotspotShape: "circle" as const,
  geoJson: circle,
  creatorId: "BRAND_A",
};

describe("create", () => {
  it("makes the hotspot with its first drop live straight away when it starts now", async () => {
    const db = makeDb();
    const out = await hotspots(db as never).create("BRAND_A", base);
    expect(out).toEqual({ hotspotId: "h_new" });
    const data = db.hotspot.create.mock.calls[0]![0].data as Row & {
      locationGroups: { create: Row & { locations: { createMany: { data: unknown[] } } } };
    };
    expect(data).toMatchObject({
      creatorId: "BRAND_A",
      platformId: "clintoncounty",
      dropEveryDays: 2,
      isActive: true,
    });
    const first = data.locationGroups.create;
    expect(first).toMatchObject({
      hidden: false,
      startDate: NOW,
      approved: true,
      limit: 5,
      remaining: 5,
    });
    expect(first.endDate).toEqual(new Date(NOW.getTime() + 86_400_000));
    expect(first.locations.createMany.data).toHaveLength(3);
  });

  it("keeps the first drop hidden, dated for the start, when the hotspot starts later", async () => {
    const db = makeDb();
    const start = new Date(NOW.getTime() + 5 * 86_400_000);
    await hotspots(db as never).create("BRAND_A", {
      ...base,
      hotspotStartDate: start.toISOString(),
      hotspotEndDate: new Date(start.getTime() + 10 * 86_400_000).toISOString(),
    });
    const first = (
      db.hotspot.create.mock.calls[0]![0].data as never as {
        locationGroups: { create: Row };
      }
    ).locationGroups.create;
    expect(first).toMatchObject({ hidden: true, startDate: start });
    expect(first.endDate).toEqual(new Date(start.getTime() + 86_400_000));
  });

  it("refuses a hotspot that ends before it starts", async () => {
    const db = makeDb();
    await expect(
      hotspots(db as never).create("BRAND_A", { ...base, hotspotEndDate: base.hotspotStartDate }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(db.hotspot.create).not.toHaveBeenCalled();
  });

  it("maps the audience and the page asset like it always did", async () => {
    const dbPrivate = makeDb();
    await hotspots(dbPrivate as never).create("BRAND_A", { ...base, tier: "private", token: -10 });
    const privateGroup = (
      dbPrivate.hotspot.create.mock.calls[0]![0].data as never as {
        locationGroups: { create: Row };
      }
    ).locationGroups.create;
    expect(privateGroup).toMatchObject({ privacy: "PRIVATE", pageAsset: true });
    expect(privateGroup.assetId).toBeUndefined();

    const dbTier = makeDb();
    await hotspots(dbTier as never).create("BRAND_A", { ...base, tier: "7", token: 12 });
    expect(
      (dbTier.hotspot.create.mock.calls[0]![0].data as never as { locationGroups: { create: Row } })
        .locationGroups.create,
    ).toMatchObject({ privacy: "TIER", subscriptionId: 7, assetId: 12, pageAsset: false });
  });
});

describe("pause, resume", () => {
  it("flips the flag the worker's look reads, only for the brand's own hotspot", async () => {
    const db = makeDb();
    expect(await hotspots(db as never).pause("BRAND_A", "h1")).toEqual({
      ok: true,
      hotspotId: "h1",
      isActive: false,
    });
    expect(db.hotspot.findFirst.mock.calls[0]![0].where).toMatchObject({
      id: "h1",
      creatorId: "BRAND_A",
    });
    expect(db.hotspot.update).toHaveBeenCalledWith({
      where: { id: "h1" },
      data: { isActive: false },
    });
    expect(await hotspots(db as never).resume("BRAND_A", "h1")).toMatchObject({ isActive: true });
    expect(db.hotspot.update).toHaveBeenLastCalledWith({
      where: { id: "h1" },
      data: { isActive: true },
    });
  });

  it("says not found for someone else's hotspot, and changes nothing", async () => {
    const db = makeDb(null);
    await expect(hotspots(db as never).pause("BRAND_B", "h1")).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
    await expect(hotspots(db as never).resume("BRAND_B", "h1")).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
    expect(db.hotspot.update).not.toHaveBeenCalled();
  });
});

describe("delete", () => {
  it("hides the hotspot and every drop it made", async () => {
    const db = makeDb();
    expect(await hotspots(db as never).delete("BRAND_A", "h1")).toEqual({
      ok: true,
      hotspotId: "h1",
    });
    expect(db.locationGroup.updateMany).toHaveBeenCalledWith({
      where: { hotspotId: "h1" },
      data: { hidden: true },
    });
    expect(db.hotspot.update).toHaveBeenCalledWith({
      where: { id: "h1" },
      data: { isActive: false, hidden: true },
    });
  });

  it("says not found for someone else's hotspot", async () => {
    const db = makeDb(null);
    await expect(hotspots(db as never).delete("BRAND_B", "h1")).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
    expect(db.locationGroup.updateMany).not.toHaveBeenCalled();
  });
});

describe("update", () => {
  const started = {
    id: "h1",
    isActive: true,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    dropEveryDays: 2,
    pinDurationDays: 1,
    hotspotStartDate: new Date("2026-11-01T00:00:00Z"),
    hotspotEndDate: new Date("2026-11-30T00:00:00Z"),
    locationGroups: [] as Row[],
  };

  it("changes the end date and collection settings, and cascades them to future drops", async () => {
    const db = makeDb(started);
    await hotspots(db as never).update("BRAND_A", "h1", {
      hotspotEndDate: "2026-12-10T00:00:00.000Z",
      autoCollect: true,
    });
    expect(db.hotspot.update.mock.calls[0]![0].data).toMatchObject({
      hotspotEndDate: new Date("2026-12-10T00:00:00.000Z"),
      autoCollect: true,
    });
    expect(db.location.updateMany).toHaveBeenCalledWith({
      where: { locationGroup: { hotspotId: "h1", startDate: { gte: NOW } } },
      data: { autoCollect: true },
    });
  });

  it("applies to every drop when asked", async () => {
    const db = makeDb(started);
    await hotspots(db as never).update("BRAND_A", "h1", { autoCollect: false, scope: "all_drops" });
    expect(db.location.updateMany).toHaveBeenCalledWith({
      where: { locationGroup: { hotspotId: "h1" } },
      data: { autoCollect: false },
    });
  });

  it("won't move the start of a hotspot that has already started", async () => {
    const db = makeDb(started);
    await expect(
      hotspots(db as never).update("BRAND_A", "h1", {
        hotspotStartDate: "2026-12-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: expect.stringMatching(/already started/),
    });
    expect(db.hotspot.update).not.toHaveBeenCalled();
  });

  it("moves a waiting first drop to the new start", async () => {
    const waiting = {
      id: "g1",
      hidden: true,
      startDate: new Date("2026-12-01T00:00:00Z"),
      createdAt: new Date("2026-11-01T00:00:00Z"),
    };
    const db = makeDb({
      ...started,
      hotspotStartDate: new Date("2026-12-01T00:00:00Z"),
      hotspotEndDate: new Date("2026-12-31T00:00:00Z"),
      locationGroups: [waiting],
    });
    await hotspots(db as never).update("BRAND_A", "h1", {
      hotspotStartDate: "2026-12-05T00:00:00.000Z",
    });
    expect(db.locationGroup.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: {
        startDate: new Date("2026-12-05T00:00:00.000Z"),
        endDate: new Date("2026-12-06T00:00:00.000Z"),
      },
    });
  });

  it("refuses a start in the past, an end before the start, and a hotspot that isn't theirs", async () => {
    const waiting = {
      id: "g1",
      hidden: true,
      startDate: new Date("2026-12-01T00:00:00Z"),
      createdAt: new Date("2026-11-01T00:00:00Z"),
    };
    const later = makeDb({
      ...started,
      hotspotStartDate: new Date("2026-12-01T00:00:00Z"),
      hotspotEndDate: new Date("2026-12-31T00:00:00Z"),
      locationGroups: [waiting],
    });
    await expect(
      hotspots(later as never).update("BRAND_A", "h1", {
        hotspotStartDate: "2026-11-02T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/future/) });
    await expect(
      hotspots(makeDb(started) as never).update("BRAND_A", "h1", {
        hotspotEndDate: "2026-10-31T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/end date must be after/) });
    await expect(
      hotspots(makeDb(null) as never).update("BRAND_B", "h1", { autoCollect: true }),
    ).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });
});
