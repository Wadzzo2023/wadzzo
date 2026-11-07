import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { enqueueJob, getJob, type Job, type SqlDb } from "./queue";
import { runOnce, startWorker, type Handlers } from "./runner";
import { testDb } from "./test-db";

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (check: () => Promise<boolean> | boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await sleep(10);
  }
  expect.fail("timed out waiting");
};

describe("runOnce", () => {
  it("runs a due job with its handler and stores the result", async () => {
    const queued = await enqueueJob(db, { type: "agent_run", creatorId: "b", payload: { n: 1 } });
    const seen: Job[] = [];
    const handlers: Handlers = {
      agent_run: (job) => {
        seen.push(job);
        return Promise.resolve({ messageId: "m1" });
      },
    };
    expect(await runOnce(db, "w", handlers, {})).toBe(true);
    expect(seen[0]).toMatchObject({ id: queued.id, creatorId: "b", payload: { n: 1 } });
    expect(await getJob(db, queued.id)).toMatchObject({
      status: "SUCCEEDED",
      result: { messageId: "m1" },
    });
  });

  it("does nothing when nothing is due, or only jobs it has no handler for", async () => {
    await enqueueJob(db, { type: "create_pins", payload: {} });
    expect(await runOnce(db, "w", { agent_run: () => Promise.resolve() }, {})).toBe(false);
  });

  it("a handler that throws fails the job and says why, and the worker carries on", async () => {
    const queued = await enqueueJob(db, { type: "agent_run", payload: {}, maxAttempts: 1 });
    const gaveUp: string[] = [];
    const handlers: Handlers = { agent_run: () => Promise.reject(new Error("model is down")) };
    await runOnce(db, "w", handlers, {
      onGaveUp: (job, message) => {
        gaveUp.push(`${job.id}:${message}`);
        return Promise.resolve();
      },
    });
    expect(await getJob(db, queued.id)).toMatchObject({
      status: "FAILED",
      lastError: "model is down",
    });
    expect(gaveUp).toEqual([`${queued.id}:model is down`]);
  });

  it("a job with attempts left is retried later, and onGaveUp is not called yet", async () => {
    const queued = await enqueueJob(db, { type: "agent_run", payload: {}, maxAttempts: 3 });
    let gaveUp = 0;
    await runOnce(
      db,
      "w",
      { agent_run: () => Promise.reject(new Error("blip")) },
      {
        onGaveUp: () => {
          gaveUp++;
          return Promise.resolve();
        },
      },
    );
    expect(await getJob(db, queued.id)).toMatchObject({ status: "QUEUED", lastError: "blip" });
    expect(gaveUp).toBe(0);
  });

  it("a job that runs too long is failed with a timeout", async () => {
    const queued = await enqueueJob(db, { type: "create_pins", payload: {}, maxAttempts: 1 });
    await runOnce(db, "w", { create_pins: () => sleep(400) }, { timeoutMs: 40 });
    const job = await getJob(db, queued.id);
    expect(job).toMatchObject({ status: "FAILED" });
    expect(job!.lastError).toMatch(/timed out after 40ms/);
  });

  it("keeps telling the database it is alive while a long job runs", async () => {
    const queued = await enqueueJob(db, { type: "create_pins", payload: {}, maxAttempts: 1 });
    let first: Date | null = null;
    let last: Date | null = null;
    const handlers: Handlers = {
      create_pins: async (job) => {
        first = (await getJob(db, job.id))!.lockedAt;
        await sleep(120);
        last = (await getJob(db, job.id))!.lockedAt;
      },
    };
    await runOnce(db, "w", handlers, { heartbeatMs: 20 });
    expect(last!.getTime()).toBeGreaterThan(first!.getTime());
    expect((await getJob(db, queued.id))!.status).toBe("SUCCEEDED");
  });
});

describe("startWorker", () => {
  it("runs jobs as they arrive, never more at once than its concurrency", async () => {
    let active = 0;
    let peak = 0;
    const handlers: Handlers = {
      agent_run: async () => {
        active++;
        peak = Math.max(peak, active);
        await sleep(40);
        active--;
      },
    };
    for (let i = 0; i < 6; i++) await enqueueJob(db, { type: "agent_run", payload: { i } });
    const worker = startWorker(db, { workerId: "w", handlers, concurrency: 2, idleMs: 10 });
    await waitFor(
      async () =>
        (await pg.query("SELECT 1 FROM jobs WHERE status <> 'SUCCEEDED'")).rows.length === 0,
    );
    await worker.stop();
    expect(peak).toBe(2);
  });

  it("stop() lets the job in hand finish, and takes no new one", async () => {
    let finished = false;
    const handlers: Handlers = {
      agent_run: async () => {
        await sleep(150);
        finished = true;
      },
    };
    await enqueueJob(db, { type: "agent_run", payload: { n: 1 } });
    const worker = startWorker(db, { workerId: "w", handlers, concurrency: 1, idleMs: 10 });
    await waitFor(() => worker.running() === 1);
    await enqueueJob(db, { type: "agent_run", payload: { n: 2 } });
    await worker.stop();
    expect(finished).toBe(true);
    const rows = (
      await pg.query<{ status: string }>('SELECT status FROM jobs ORDER BY "createdAt"')
    ).rows;
    expect(rows.map((r) => r.status)).toEqual(["SUCCEEDED", "QUEUED"]);
  });

  it("a database error in the loop doesn't kill the worker", async () => {
    let broken = true;
    const flaky: SqlDb = {
      $queryRawUnsafe: (sql, ...values) =>
        broken ? Promise.reject(new Error("connection reset")) : db.$queryRawUnsafe(sql, ...values),
      $executeRawUnsafe: (sql, ...values) => db.$executeRawUnsafe(sql, ...values),
    };
    const queued = await enqueueJob(db, { type: "agent_run", payload: {} });
    const worker = startWorker(flaky, {
      workerId: "w",
      handlers: { agent_run: () => Promise.resolve("ok") },
      concurrency: 1,
      idleMs: 10,
      onError: () => undefined,
    });
    await sleep(60);
    broken = false;
    await waitFor(async () => (await getJob(db, queued.id))!.status === "SUCCEEDED");
    await worker.stop();
  });

  it("puts back a job a dead worker left running", async () => {
    const queued = await enqueueJob(db, { type: "agent_run", payload: {}, maxAttempts: 3 });
    await pg.query(
      `UPDATE jobs SET status = 'RUNNING', attempts = 1, "lockedBy" = 'dead',
              "lockedAt" = $2::timestamp WHERE id = $1`,
      [queued.id, new Date(Date.now() - 3_600_000).toISOString()],
    );
    const worker = startWorker(db, {
      workerId: "w",
      handlers: { agent_run: () => Promise.resolve("ok") },
      concurrency: 1,
      idleMs: 10,
      maintenanceMs: 20,
    });
    await waitFor(async () => (await getJob(db, queued.id))!.status === "SUCCEEDED");
    await worker.stop();
  });
});
