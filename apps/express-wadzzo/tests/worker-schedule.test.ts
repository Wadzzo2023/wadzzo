import type { SqlDb } from "@wadzzo/jobs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SCHEDULES, startSchedules } from "../src/workers/schedule";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function recordingDb() {
  const inserted: unknown[][] = [];
  const db: SqlDb = {
    $queryRawUnsafe: (sql: string, ...values: unknown[]) => {
      if (sql.includes("INSERT")) inserted.push(values);
      return Promise.resolve([{ id: "j" }] as never);
    },
    $executeRawUnsafe: () => Promise.resolve(0),
  };
  return { db, inserted };
}

describe("what runs on a clock", () => {
  it("looks at the hotspots every five minutes, and only that", () => {
    expect(SCHEDULES).toEqual([{ type: "hotspot_drop", everyMs: 5 * 60_000 }]);
  });

  it("adds the job at once, then again each time it is due", async () => {
    const { db } = recordingDb();
    const queries = vi.spyOn(db, "$queryRawUnsafe");
    const stop = startSchedules(db);
    await vi.advanceTimersByTimeAsync(0);
    const first = queries.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(queries.mock.calls.length).toBeGreaterThan(first);
    stop();
    const stopped = queries.mock.calls.length;
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(queries.mock.calls.length).toBe(stopped);
  });

  it("asks for dedupe and one attempt, so a slow look never piles up behind itself", async () => {
    const { db } = recordingDb();
    const queries = vi.spyOn(db, "$queryRawUnsafe");
    startSchedules(db)();
    await vi.advanceTimersByTimeAsync(0);
    // The first statement is the dedupe check (a SELECT of waiting or running jobs).
    expect(String(queries.mock.calls[0]![0])).toMatch(/status IN \('QUEUED', 'RUNNING'\)/);
  });

  it("a database error is reported and doesn't stop the clock", async () => {
    const errors: unknown[] = [];
    const db: SqlDb = {
      $queryRawUnsafe: () => Promise.reject(new Error("down")),
      $executeRawUnsafe: () => Promise.resolve(0),
    };
    const stop = startSchedules(db, SCHEDULES, (error) => errors.push(error));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    stop();
  });
});
