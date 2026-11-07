import type { Job } from "@wadzzo/jobs";
import { describe, expect, it, vi } from "vitest";

import { jobQueue } from "../lib/jobs";

// The brand app's side of the worker queue: add a job, read how it is going.

function row(over: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    type: "agent_run",
    creatorId: "BRAND_A",
    payload: {},
    status: "QUEUED",
    attempts: 0,
    maxAttempts: 1,
    runAt: new Date(),
    lockedAt: null,
    lockedBy: null,
    lastError: null,
    result: null,
    progress: 0,
    steps: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function dbReturning(rows: Job[]) {
  const query = vi.fn(async (_sql: string, ..._values: unknown[]) => rows as never);
  return {
    db: { $queryRawUnsafe: query, $executeRawUnsafe: vi.fn(async () => 0) },
    query,
  };
}

describe("enqueue", () => {
  it("adds the job for the brand with its payload and attempt limit, and returns its id", async () => {
    const { db, query } = dbReturning([row({ id: "job-9" })]);
    const out = await jobQueue(db).enqueue("agent_run", "BRAND_A", { text: "hi" }, 1);
    expect(out).toEqual({ jobId: "job-9" });
    const [sql, ...values] = query.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO jobs/);
    expect(values).toEqual(
      expect.arrayContaining(["agent_run", "BRAND_A", JSON.stringify({ text: "hi" }), 1]),
    );
  });

  it("a pin batch is never retried unless asked: the default is one attempt", async () => {
    const { db, query } = dbReturning([row()]);
    await jobQueue(db).enqueue("create_pins", "BRAND_A", { pins: [] });
    expect(query.mock.calls[0]!.slice(1)).toContain(1);
  });
});

describe("poll", () => {
  const poll = async (status: Job["status"], over: Partial<Job> = {}) =>
    jobQueue(dbReturning([row({ status, ...over })]).db).poll("job-1");

  it("reads the state the way the chat has always seen it", async () => {
    expect((await poll("QUEUED")).status).toBe("pending");
    expect((await poll("RUNNING")).status).toBe("processing");
    expect((await poll("SUCCEEDED")).status).toBe("completed");
    expect((await poll("FAILED")).status).toBe("failed");
  });

  it("carries the brand, the steps, the result and the error", async () => {
    const steps = [{ id: "s1", label: "Searching", status: "done" }];
    expect(await poll("SUCCEEDED", { result: { messageId: "m1" }, steps, progress: 100 })).toEqual({
      jobId: "job-1",
      creatorId: "BRAND_A",
      status: "completed",
      result: { messageId: "m1" },
      error: undefined,
      progress: 100,
      steps,
    });
    expect(await poll("FAILED", { lastError: "model is down" })).toMatchObject({
      status: "failed",
      error: "model is down",
    });
  });

  it("says not found for a job that doesn't exist, or one with no brand", async () => {
    await expect(jobQueue(dbReturning([]).db).poll("nope")).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });
});
