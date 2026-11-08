import { describe, expect, it, vi } from "vitest";

// The task server's pin creation (package/express-wadzzo/src/workers/create-pins-worker.ts).
const db = {
  locationGroupJob: {
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  locationTagCache: {
    findUnique: vi.fn(async () => ({ tags: ["park"] })),
    upsert: vi.fn(async () => ({})),
  },
  locationTag: { upsert: vi.fn(async () => ({ id: "t1", name: "park" })) },
  locationGroupTag: { createMany: vi.fn(async () => ({ count: 1 })) },
  locationGroup: { create: vi.fn(async () => ({ id: "lg_1" })) },
  creator: {
    findUniqueOrThrow: vi.fn(),
  },
};
vi.mock("../src/lib/db", () => ({ db }));
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/google-place-enrichment", () => ({
  enrichPinFromGooglePlace: vi.fn(),
}));
vi.mock("../../express-wadzzo/src/lib/image-optimizer", () => ({
  createOptimizedImage: vi.fn(),
}));

const { runCreatePinsJob } = await import("../src/workers/create-pins-worker");

const pin = {
  id: "a",
  type: "LANDMARK",
  title: "Park",
  description: "",
  latitude: 41.8,
  longitude: -90.2,
  startDate: "2026-10-10",
  endDate: "2026-11-10",
  pinCollectionLimit: 1,
  radius: 2,
};
const job = {
  id: "job-1",
  type: "create_pins",
  creatorId: "BRAND_A",
  payload: {
    locationGroupJobId: "lgj_1",
    creatorId: "BRAND_A",
    pins: [pin],
    pinOptions: {
      autoCollect: false,
      groupingMode: "per-location",
      pinNumber: 1,
    },
  },
};

describe("pin creation", () => {
  it("marks the brand's pin job failed when it crashes, so the card stops waiting", async () => {
    db.creator.findUniqueOrThrow.mockRejectedValueOnce(new Error("database went away"));
    await expect(runCreatePinsJob(job as never)).rejects.toThrow("database went away");
    expect(db.locationGroupJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: "lgj_1",
        creatorId: "BRAND_A",
        status: { in: ["pending", "processing"] },
      },
      data: { status: "failed", error: "database went away" },
    });
  });

  it("automatically accepts pins by setting approved: true upon creation", async () => {
    db.creator.findUniqueOrThrow.mockResolvedValueOnce({ platformId: "wadzzo" });
    await runCreatePinsJob(job as never);
    const firstCall = db.locationGroup.create.mock.calls[0] as
      [{ data: { approved?: boolean } }] | undefined;
    expect(firstCall?.[0]?.data.approved).toBe(true);
  });

  describe("pin look", () => {
    const look = {
      markerShape: null,
      pinShapeId: "shape_1",
      markerFill: "NONE",
      markerColor: "#111827",
      markerImageFit: null,
      markerAutoBadge: false,
    };
    const withLook = (groupingMode: "per-location" | "single-group") => ({
      ...job,
      payload: {
        ...job.payload,
        pinOptions: { ...job.payload.pinOptions, groupingMode, look },
      },
    });
    const created = () =>
      (db.locationGroup.create.mock.calls.at(-1) as [{ data: Record<string, unknown> }])[0].data;

    it.each(["per-location", "single-group"] as const)(
      "draws every %s pin with the look the brand chose",
      async (mode) => {
        db.creator.findUniqueOrThrow.mockResolvedValueOnce({ platformId: "wadzzo" });
        await runCreatePinsJob(withLook(mode) as never);
        expect(created()).toMatchObject({
          pinShapeId: "shape_1",
          markerShape: null,
          markerFill: "NONE",
          markerColor: "#111827",
          markerAutoBadge: false,
        });
      },
    );

    it("leaves the look columns out when the job has none, so the default look applies", async () => {
      db.creator.findUniqueOrThrow.mockResolvedValueOnce({ platformId: "wadzzo" });
      await runCreatePinsJob(job as never);
      expect(Object.keys(created())).not.toContain("markerFill");
      expect(Object.keys(created())).not.toContain("pinShapeId");
    });
  });
});
