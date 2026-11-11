import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@wadzzo/auth", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("@wadzzo/db/server", () => ({ db: {} }));
vi.mock("../env", () => ({ env: { PLATFORM_SLUG: "wadzzo" } }));

import { checkLayer, layerFilterWhere, mapLayerChips } from "../shared/layers";
import { matchRoute } from "../ar/mobile/routes";

describe("layerFilterWhere", () => {
  it("doesn't filter when no layer is asked for (the App Store app)", () => {
    expect(layerFilterWhere(undefined)).toEqual({});
  });

  it('"none" means regular pins only', () => {
    expect(layerFilterWhere("none")).toEqual({ layerId: null });
  });

  it("a chip id, or several joined by commas, means those layers' pins", () => {
    expect(layerFilterWhere("a")).toEqual({ layerId: { in: ["a"] } });
    expect(layerFilterWhere("a, b,")).toEqual({ layerId: { in: ["a", "b"] } });
  });
});

describe("mapLayerChips", () => {
  it("gives each brand's layer its own chip, by name then brand", async () => {
    const db = {
      locationGroup: {
        groupBy: vi.fn(async () => [
          { layerId: "h1", _count: { _all: 2 } },
          { layerId: "h2", _count: { _all: 3 } },
          { layerId: "s1", _count: { _all: 1 } },
        ]),
      },
      pinLayer: {
        findMany: vi.fn(async () => [
          { id: "s1", name: "School", icon: "School", color: "#0090FF", creator: { name: "Acme", profileUrl: "acme.png" } },
          {
            id: "h2",
            name: "Hospital",
            icon: "Hospital",
            color: "#E5484D",
            creator: { name: "Zed", profileUrl: null },
          },
          {
            id: "h1",
            name: "hospital",
            icon: "Hospital",
            color: "#46A758",
            creator: { name: "Acme", profileUrl: "acme.png" },
          },
        ]),
      },
    } as never;
    await expect(mapLayerChips(db, {})).resolves.toEqual([
      {
        id: "h1",
        name: "hospital",
        icon: "Hospital",
        color: "#46A758",
        brand: "Acme",
        brandImage: "acme.png",
        pinCount: 2,
      },
      { id: "h2", name: "Hospital", icon: "Hospital", color: "#E5484D", brand: "Zed", brandImage: null, pinCount: 3 },
      { id: "s1", name: "School", icon: "School", color: "#0090FF", brand: "Acme", brandImage: "acme.png", pinCount: 1 },
    ]);
  });

  it("is empty when no live pin is in a layer", async () => {
    const db = {
      locationGroup: { groupBy: vi.fn(async () => []) },
      pinLayer: { findMany: vi.fn() },
    } as never;
    await expect(mapLayerChips(db, {})).resolves.toEqual([]);
  });
});

describe("checkLayer", () => {
  const db = (owner: string | null) =>
    ({
      pinLayer: { findUnique: vi.fn(async () => (owner ? { creatorId: owner } : null)) },
    }) as never;

  it("leaves the column alone when no layer is given, and allows No layer", async () => {
    await expect(checkLayer(db(null), "GBRAND", undefined)).resolves.toBeUndefined();
    await expect(checkLayer(db(null), "GBRAND", null)).resolves.toBeNull();
  });

  it("allows the brand's own layer", async () => {
    await expect(checkLayer(db("GBRAND"), "GBRAND", "L1")).resolves.toBe("L1");
  });

  it("refuses another brand's layer, or one that's gone", async () => {
    await expect(checkLayer(db("GOTHER"), "GBRAND", "L1")).rejects.toThrow(
      /isn't one of this brand's/,
    );
    await expect(checkLayer(db(null), "GBRAND", "L1")).rejects.toThrow(/isn't one of this brand's/);
  });

  it("keeps the layer a row already has without looking it up", async () => {
    const d = db(null);
    await expect(checkLayer(d, "GBRAND", "L1", "L1")).resolves.toBe("L1");
    expect(
      (d as { pinLayer: { findUnique: ReturnType<typeof vi.fn> } }).pinLayer.findUnique,
    ).not.toHaveBeenCalled();
  });
});

describe("maps.layer router", () => {
  const BRAND = "GBRAND";
  const WADZZO = { id: "wadzzo", name: "Wadzzo", isRoot: true };

  /** A brand's session with a stand-in database. */
  function ctxFor(opts: { layerOwner?: string } = {}) {
    const db = {
      creator: {
        findUnique: vi.fn(async () => ({
          platformId: "wadzzo",
          aprovalSend: true,
          approved: true,
        })),
      },
      admin: { findUnique: vi.fn(async () => null) },
      pinLayer: {
        count: vi.fn(async () => 0),
        findMany: vi.fn(async () => [
          {
            id: "L1",
            name: "Hospitals",
            icon: "Hospital",
            color: "#E5484D",
            _count: { locationGroups: 3, hotspots: 1, trails: 2 },
          },
        ]),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          creatorId: opts.layerOwner ?? BRAND,
          platformId: "wadzzo",
        })),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: "L-new",
          ...data,
        })),
        update: vi.fn(
          async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
            id: where.id,
            ...data,
          }),
        ),
        delete: vi.fn(),
      },
    };
    return { ctx: { session: { user: { id: BRAND } }, platform: WADZZO, db }, db };
  }

  type Caller = {
    list: (input?: unknown) => Promise<unknown[]>;
    create: (input: unknown) => Promise<{ id: string }>;
    update: (input: unknown) => Promise<{ id: string }>;
    delete: (input: { id: string }) => Promise<{ id: string }>;
  };
  let caller: (ctx: unknown) => Caller;
  beforeAll(async () => {
    const { createCallerFactory } = await import("../brand/trpc");
    const { layerRouter } = await import("../brand/routers/maps/layer");
    const factory = createCallerFactory(layerRouter);
    caller = (ctx) => factory(ctx as never) as never;
  });

  const fields = { name: "Hospitals", icon: "Hospital", color: "#E5484D" };

  it("lists the brand's layers with what's in each", async () => {
    const { ctx, db } = ctxFor();
    await expect(caller(ctx).list()).resolves.toEqual([
      { id: "L1", ...fields, pins: 3, hotspots: 1, trails: 2 },
    ]);
    expect(db.pinLayer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { creatorId: BRAND } }),
    );
  });

  it("makes a layer stamped with the brand and its platform", async () => {
    const { ctx, db } = ctxFor();
    await expect(caller(ctx).create(fields)).resolves.toMatchObject({ id: "L-new" });
    expect(db.pinLayer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { ...fields, creatorId: BRAND, platformId: "wadzzo" },
      }),
    );
    // Names are free: no uniqueness check, only the count.
    expect(db.pinLayer.count).toHaveBeenCalledWith({ where: { creatorId: BRAND } });
  });

  it("stops at the brand's layer limit", async () => {
    const { ctx, db } = ctxFor();
    db.pinLayer.count.mockResolvedValueOnce(30);
    await expect(caller(ctx).create(fields)).rejects.toThrow(/30 layers/);
    expect(db.pinLayer.create).not.toHaveBeenCalled();
  });

  it("refuses an icon that isn't on the list", async () => {
    const { ctx } = ctxFor();
    await expect(caller(ctx).create({ ...fields, icon: "Nope" })).rejects.toThrow();
  });

  it("renames the brand's own layer", async () => {
    const { ctx, db } = ctxFor();
    await caller(ctx).update({ ...fields, id: "L1", name: "Clinics" });
    expect(db.pinLayer.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "L1" }, data: { ...fields, name: "Clinics" } }),
    );
  });

  it("won't edit or delete another brand's layer", async () => {
    const { ctx, db } = ctxFor({ layerOwner: "GOTHER" });
    await expect(caller(ctx).update({ ...fields, id: "L1" })).rejects.toThrow(/owner or an admin/);
    await expect(caller(ctx).delete({ id: "L1" })).rejects.toThrow(/owner or an admin/);
    expect(db.pinLayer.update).not.toHaveBeenCalled();
    expect(db.pinLayer.delete).not.toHaveBeenCalled();
  });

  it("deletes the brand's own layer", async () => {
    const { ctx, db } = ctxFor();
    await expect(caller(ctx).delete({ id: "L1" })).resolves.toEqual({ id: "L1" });
    expect(db.pinLayer.delete).toHaveBeenCalledWith({ where: { id: "L1" } });
  });
});

describe("mobile /pins contract", () => {
  const call = async (query: Record<string, string | undefined>) => {
    const list = vi.fn(async (_input: Record<string, unknown>) => []);
    const m = matchRoute("GET", "/pins");
    if (!m || typeof m === "string") throw new Error("no /pins route");
    await m.route.handler({
      req: new Request("http://x/api/mobile/v1/pins"),
      params: {},
      query,
      body: undefined,
      caller: { pins: { list } } as never,
      session: null,
    });
    return list.mock.calls[0]![0];
  };

  it("without ?layer= asks for every pin, as the App Store app always has", async () => {
    const input = await call({ lat: "41.8", lng: "-90.2", radiusKm: "50" });
    expect(input.layer).toBeUndefined();
    expect(input).toMatchObject({ lat: 41.8, lng: -90.2, radiusKm: 50 });
  });

  it("passes ?layer= through for newer app builds", async () => {
    expect((await call({ layer: "none" })).layer).toBe("none");
    expect((await call({ layer: "h1,h2" })).layer).toBe("h1,h2");
  });

  it("has a /layers route", () => {
    const m = matchRoute("GET", "/layers");
    expect(m && typeof m !== "string" ? m.route.path : null).toBe("/layers");
  });
});
