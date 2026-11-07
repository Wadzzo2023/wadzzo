import type { Job } from "@wadzzo/jobs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// How the worker hands each kind of job to the code that does it. The code itself (the agent, the
// pin maker, the hotspot look) has its own tests; here they are stand-ins.

vi.mock("../src/lib/db", () => ({ db: { marker: "db" } }));
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const runAgentJob = vi.fn(async (_job: unknown): Promise<unknown> => ({ messageId: "m1" }));
vi.mock("../src/workers/agent-worker", () => ({ runAgentJob }));
const runCreatePinsJob = vi.fn(async (_job: unknown): Promise<unknown> => ({ created: 3 }));
const failPinJob = vi.fn(async (_job: unknown, _reason: string): Promise<void> => undefined);
vi.mock("../src/workers/create-pins-worker", () => ({ runCreatePinsJob, failPinJob }));
const dropDueHotspots = vi.fn();
vi.mock("../src/lib/hotspot-drop", () => ({ dropDueHotspots }));

const { handlers, onGaveUp } = await import("../src/workers/handlers");

const job = (over: Partial<Job> = {}): Job => ({
  id: "j1",
  type: "agent_run",
  creatorId: "BRAND_A",
  payload: { text: "hi" },
  status: "RUNNING",
  attempts: 1,
  maxAttempts: 1,
  runAt: new Date(),
  lockedAt: new Date(),
  lockedBy: "w",
  lastError: null,
  result: null,
  progress: 0,
  steps: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("which kinds of job the worker knows", () => {
  it("agent_run, create_pins and hotspot_drop, and nothing else", () => {
    expect(Object.keys(handlers).sort()).toEqual(["agent_run", "create_pins", "hotspot_drop"]);
  });
});

describe("agent_run and create_pins", () => {
  it("hand the job, with its brand and payload, to the agent and to the pin maker", async () => {
    expect(await handlers.agent_run!(job())).toEqual({ messageId: "m1" });
    expect(runAgentJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: "j1", creatorId: "BRAND_A", payload: { text: "hi" } }),
    );
    expect(await handlers.create_pins!(job({ type: "create_pins" }))).toEqual({ created: 3 });
    expect(runCreatePinsJob).toHaveBeenCalledTimes(1);
  });

  it("refuse a job that doesn't say which brand it is for, before doing anything", async () => {
    await expect(handlers.agent_run!(job({ creatorId: null }))).rejects.toThrow(/brand/i);
    await expect(handlers.create_pins!(job({ creatorId: null }))).rejects.toThrow(/brand/i);
    expect(runAgentJob).not.toHaveBeenCalled();
    expect(runCreatePinsJob).not.toHaveBeenCalled();
  });
});

describe("hotspot_drop", () => {
  it("returns what the look did", async () => {
    const summary = { checked: 2, dropped: 1, released: 0, ended: 0, failed: 0, errors: [] };
    dropDueHotspots.mockResolvedValue(summary);
    expect(await handlers.hotspot_drop!(job({ type: "hotspot_drop", creatorId: null }))).toEqual(
      summary,
    );
  });

  it("fails the job, naming the hotspots, when any hotspot failed (the next look tries again)", async () => {
    dropDueHotspots.mockResolvedValue({
      checked: 2,
      dropped: 1,
      released: 0,
      ended: 0,
      failed: 1,
      errors: ["h1: database blinked"],
    });
    await expect(handlers.hotspot_drop!(job({ type: "hotspot_drop" }))).rejects.toThrow(
      /h1: database blinked/,
    );
  });
});

describe("when a job fails for good", () => {
  it("a pin batch is marked failed, so its card stops waiting", async () => {
    await onGaveUp(job({ type: "create_pins" }), "timed out");
    expect(failPinJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: "j1", creatorId: "BRAND_A" }),
      "timed out",
    );
  });

  it("other kinds have nothing more to close", async () => {
    await onGaveUp(job({ type: "agent_run" }), "boom");
    await onGaveUp(job({ type: "hotspot_drop" }), "boom");
    expect(failPinJob).not.toHaveBeenCalled();
  });
});
