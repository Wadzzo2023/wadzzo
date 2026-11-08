import { describe, expect, it, vi } from "vitest";

import { MAX_TEMPLATES_PER_BRAND } from "@wadzzo/schemas/pin-template";

import { pinTemplates } from "../server/pin-templates";

// Template reads and writes, against a stand-in database.

type Row = Record<string, unknown>;
const NOW = new Date("2026-11-08T10:00:00Z");
const stored = (over: Row = {}) => ({
  id: "t1",
  creatorId: "BRAND_A",
  platformId: "clintoncounty",
  name: "Coffee",
  formType: "PIN",
  data: { title: "Free coffee", location: { lat: 23.8, lng: 90.4 } },
  schemaVersion: 1,
  hasLocation: true,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

function makeDb(row: Row | null = stored(), count = 0) {
  return {
    pinTemplate: {
      findUnique: vi.fn(async () => row),
      findMany: vi.fn(async () => (row ? [row] : [])),
      count: vi.fn(async () => count),
      create: vi.fn(async ({ data }: { data: Row }) => ({ ...stored(), ...data, id: "t_new" })),
      update: vi.fn(async ({ data }: { data: Row }) => ({ ...stored(), ...data })),
      delete: vi.fn(async () => ({})),
    },
  };
}

describe("pin templates", () => {
  it("saves with the brand's platform, the current version and whether it has a location", async () => {
    const db = makeDb();
    await pinTemplates(db as never).create("BRAND_A", "clintoncounty", {
      name: "  Coffee  ",
      formType: "PIN",
      data: { title: "Free coffee", location: { lat: 23.8, lng: 90.4 } },
    });
    expect(db.pinTemplate.create.mock.calls[0]![0].data).toMatchObject({
      creatorId: "BRAND_A",
      platformId: "clintoncounty",
      name: "Coffee",
      formType: "PIN",
      schemaVersion: 1,
      hasLocation: true,
    });
  });

  it("refuses values of the wrong kind", async () => {
    const db = makeDb();
    await expect(
      pinTemplates(db as never).create("BRAND_A", "wadzzo", {
        name: "X",
        formType: "PIN",
        data: { pinNumber: -3 },
      }),
    ).rejects.toThrow(/aren't valid/);
    expect(db.pinTemplate.create).not.toHaveBeenCalled();
  });

  it("stops at the per-brand limit", async () => {
    const db = makeDb(stored(), MAX_TEMPLATES_PER_BRAND);
    await expect(
      pinTemplates(db as never).create("BRAND_A", "wadzzo", {
        name: "X",
        formType: "PIN",
        data: {},
      }),
    ).rejects.toThrow(/up to/);
  });

  it("opens a template whose saved data partly broke, keeping what still reads", async () => {
    const db = makeDb(stored({ data: { title: "Ok", pinNumber: "many" } }));
    const t = await pinTemplates(db as never).get("t1");
    expect(t.data).toEqual({ title: "Ok" });
  });

  it("removing the location clears hasLocation", async () => {
    const db = makeDb();
    await pinTemplates(db as never).update("t1", { data: { title: "No place" } });
    expect(db.pinTemplate.update.mock.calls[0]![0].data).toMatchObject({ hasLocation: false });
  });

  it("checks a change against the template's own kind", async () => {
    const db = makeDb(stored({ formType: "HOTSPOT", data: {} }));
    await expect(
      pinTemplates(db as never).update("t1", { data: { dropEveryDays: 0 } }),
    ).rejects.toThrow(/aren't valid/);
  });

  it("duplicates into the same brand and platform", async () => {
    const db = makeDb();
    await pinTemplates(db as never).duplicate("t1");
    expect(db.pinTemplate.create.mock.calls[0]![0].data).toMatchObject({
      creatorId: "BRAND_A",
      platformId: "clintoncounty",
      name: "Coffee (copy)",
    });
  });

  it("says not found for a missing template", async () => {
    const db = makeDb(null);
    await expect(pinTemplates(db as never).remove("nope")).rejects.toThrow(/not found/i);
  });
});
