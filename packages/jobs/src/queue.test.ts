import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STALE_AFTER_MS,
  claimJob,
  completeJob,
  enqueueJob,
  failJob,
  getJob,
  heartbeatJob,
  jobCounts,
  releaseStaleJobs,
  retryAt,
  setJobProgress,
  type SqlDb,
} from "./queue";
import { JOB_TABLE_SQL, testDb } from "./test-db";

// Starting an in-process Postgres is slow on a busy CI machine (many packages test at once).
vi.setConfig({ hookTimeout: 60_000, testTimeout: 30_000 });

let pg: PGlite;
let db: SqlDb;

beforeAll(async () => {
  ({ pg, db } = await testDb());
});

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec('DELETE FROM "jobs"');
});

const T0 = new Date("2026-11-07T10:00:00.000Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

describe("the table file", () => {
  it("can be run twice (the deploy runs it every time)", async () => {
    await pg.exec(JOB_TABLE_SQL);
    await pg.exec(JOB_TABLE_SQL);
  });
});

describe("enqueueJob", () => {
  it("adds a waiting job with its brand and payload", async () => {
    const job = await enqueueJob(
      db,
      { type: "agent_run", creatorId: "brand1", payload: { text: "hi" }, maxAttempts: 1 },
      T0,
    );
    expect(job).toMatchObject({
      type: "agent_run",
      creatorId: "brand1",
      payload: { text: "hi" },
      status: "QUEUED",
      attempts: 0,
      maxAttempts: 1,
      progress: 0,
    });
    expect(job.id).toBeTruthy();
    expect(await getJob(db, job.id)).toMatchObject({ id: job.id, status: "QUEUED" });
  });

  it("with dedupe, a job of the same type and payload that is waiting is reused", async () => {
    const a = await enqueueJob(db, { type: "hotspot_drop", payload: {}, dedupe: true }, T0);
    const b = await enqueueJob(db, { type: "hotspot_drop", payload: {}, dedupe: true }, T0);
    expect(b.id).toBe(a.id);
    const other = await enqueueJob(db, { type: "create_pins", payload: {}, dedupe: true }, T0);
    expect(other.id).not.toBe(a.id);
  });

  it("with dedupe, a running one is reused too, a finished one is not", async () => {
    const a = await enqueueJob(db, { type: "hotspot_drop", payload: {}, dedupe: true }, T0);
    const claimed = (await claimJob(db, "w1", ["hotspot_drop"], T0))!;
    expect((await enqueueJob(db, { type: "hotspot_drop", payload: {}, dedupe: true }, T0)).id).toBe(
      a.id,
    );
    await completeJob(db, claimed.id, { ok: true }, T0);
    expect(
      (await enqueueJob(db, { type: "hotspot_drop", payload: {}, dedupe: true }, T0)).id,
    ).not.toBe(a.id);
  });
});

describe("claimJob: one worker gets one job, once", () => {
  it("takes the oldest due job of a type the worker knows, and marks it running", async () => {
    const first = await enqueueJob(db, { type: "agent_run", payload: { n: 1 } }, T0);
    await enqueueJob(db, { type: "agent_run", payload: { n: 2 } }, later(1000));
    const job = await claimJob(db, "worker-a", ["agent_run"], later(5000));
    expect(job).toMatchObject({
      id: first.id,
      status: "RUNNING",
      attempts: 1,
      lockedBy: "worker-a",
    });
    expect(job!.lockedAt).toEqual(later(5000));
  });

  it("ignores jobs of other types, and jobs not due yet", async () => {
    await enqueueJob(db, { type: "create_pins", payload: {} }, T0);
    await enqueueJob(db, { type: "agent_run", payload: {}, runAt: later(60_000) }, T0);
    expect(await claimJob(db, "w", ["agent_run"], T0)).toBeNull();
    expect(await claimJob(db, "w", ["agent_run"], later(60_000))).not.toBeNull();
  });

  it("never gives the same job to two workers asking at once", async () => {
    for (let i = 0; i < 6; i++) await enqueueJob(db, { type: "agent_run", payload: { i } }, T0);
    const claimed = await Promise.all(
      Array.from({ length: 12 }, (_, i) => claimJob(db, `w${i}`, ["agent_run"], later(10))),
    );
    const ids = claimed.filter(Boolean).map((job) => job!.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });

  it("does not hand out a running job again", async () => {
    await enqueueJob(db, { type: "agent_run", payload: {} }, T0);
    expect(await claimJob(db, "a", ["agent_run"], T0)).not.toBeNull();
    expect(await claimJob(db, "b", ["agent_run"], T0)).toBeNull();
  });
});

describe("completing and failing", () => {
  it("complete stores the result and clears the lock", async () => {
    await enqueueJob(db, { type: "agent_run", payload: {} }, T0);
    const job = (await claimJob(db, "w", ["agent_run"], T0))!;
    await completeJob(db, job.id, { messageId: "m1" }, later(1000));
    expect(await getJob(db, job.id)).toMatchObject({
      status: "SUCCEEDED",
      result: { messageId: "m1" },
      progress: 100,
      lockedBy: null,
      lockedAt: null,
    });
  });

  it("a job that may run once fails for good and keeps its error", async () => {
    await enqueueJob(db, { type: "create_pins", payload: {}, maxAttempts: 1 }, T0);
    const job = (await claimJob(db, "w", ["create_pins"], T0))!;
    const { retryAt: next } = await failJob(db, job, new Error("boom"), T0);
    expect(next).toBeNull();
    expect(await getJob(db, job.id)).toMatchObject({ status: "FAILED", lastError: "boom" });
    expect(await claimJob(db, "w", ["create_pins"], later(24 * 3_600_000))).toBeNull();
  });

  it("a job with attempts left waits and then runs again", async () => {
    await enqueueJob(db, { type: "agent_run", payload: {}, maxAttempts: 3 }, T0);
    const job = (await claimJob(db, "w", ["agent_run"], T0))!;
    const { retryAt: next } = await failJob(db, job, "network", T0);
    expect(next).toEqual(later(60_000));
    expect(await claimJob(db, "w", ["agent_run"], later(30_000))).toBeNull();
    expect(await claimJob(db, "w", ["agent_run"], later(60_000))).toMatchObject({ attempts: 2 });
  });

  it("retry waits grow: 1, 5, 15, 60 minutes, and stop at the limit", () => {
    expect(retryAt(1, 5, T0)).toEqual(later(60_000));
    expect(retryAt(2, 5, T0)).toEqual(later(5 * 60_000));
    expect(retryAt(3, 5, T0)).toEqual(later(15 * 60_000));
    expect(retryAt(4, 5, T0)).toEqual(later(60 * 60_000));
    expect(retryAt(5, 5, T0)).toBeNull();
    expect(retryAt(1, 1, T0)).toBeNull();
  });
});

describe("a worker that dies mid-job", () => {
  it("a job nobody has touched for a while goes back if it has attempts left", async () => {
    await enqueueJob(db, { type: "hotspot_drop", payload: {}, maxAttempts: 3 }, T0);
    await claimJob(db, "dead", ["hotspot_drop"], T0);
    expect(await releaseStaleJobs(db, later(STALE_AFTER_MS - 1000))).toEqual({
      requeued: 0,
      failed: [],
    });
    expect(await releaseStaleJobs(db, later(STALE_AFTER_MS + 1000))).toEqual({
      requeued: 1,
      failed: [],
    });
    expect(
      await claimJob(db, "alive", ["hotspot_drop"], later(STALE_AFTER_MS + 1000)),
    ).toMatchObject({
      lockedBy: "alive",
    });
  });

  it("a job meant to run once is failed, never run a second time (it may have made pins)", async () => {
    const queued = await enqueueJob(db, { type: "create_pins", payload: {}, maxAttempts: 1 }, T0);
    await claimJob(db, "dead", ["create_pins"], T0);
    const released = await releaseStaleJobs(db, later(STALE_AFTER_MS + 1000));
    // The caller is told which jobs were given up on, so it can close their own records.
    expect(released.failed.map((job) => job.id)).toEqual([queued.id]);
    expect(released.requeued).toBe(0);
    const job = (await getJob(db, queued.id))!;
    expect(job.status).toBe("FAILED");
    expect(job.lastError).toMatch(/stopped/i);
    expect(await claimJob(db, "alive", ["create_pins"], later(STALE_AFTER_MS + 5000))).toBeNull();
  });

  it("a worker that is still alive keeps its job by touching it", async () => {
    await enqueueJob(db, { type: "create_pins", payload: {}, maxAttempts: 1 }, T0);
    const job = (await claimJob(db, "w", ["create_pins"], T0))!;
    await heartbeatJob(db, job.id, later(STALE_AFTER_MS - 1000));
    expect(await releaseStaleJobs(db, later(STALE_AFTER_MS + 1000))).toEqual({
      requeued: 0,
      failed: [],
    });
    expect((await getJob(db, job.id))!.status).toBe("RUNNING");
  });
});

describe("progress for the chat", () => {
  it("stores the steps and progress, and getJob returns them", async () => {
    await enqueueJob(db, { type: "agent_run", creatorId: "b", payload: {} }, T0);
    const job = (await claimJob(db, "w", ["agent_run"], T0))!;
    const steps = [{ id: "s1", label: "Searching", status: "running" }];
    await setJobProgress(db, job.id, { steps, progress: 40 }, later(500));
    expect(await getJob(db, job.id)).toMatchObject({ steps, progress: 40 });
    await setJobProgress(db, job.id, { progress: 70 }, later(900));
    expect(await getJob(db, job.id)).toMatchObject({ steps, progress: 70 });
  });

  it("getJob is null for a job that doesn't exist", async () => {
    expect(await getJob(db, "nope")).toBeNull();
  });
});

describe("jobCounts", () => {
  it("counts jobs by state, for the health check", async () => {
    await enqueueJob(db, { type: "agent_run", payload: {} }, T0);
    await enqueueJob(db, { type: "agent_run", payload: {} }, T0);
    await claimJob(db, "w", ["agent_run"], T0);
    expect(await jobCounts(db)).toMatchObject({ queued: 1, running: 1, succeeded: 0, failed: 0 });
  });
});
