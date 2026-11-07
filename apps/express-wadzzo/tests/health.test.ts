import { describe, expect, it } from "vitest";

import { workerIsAlive } from "../src/routes/health";

const NOW = new Date("2026-11-07T10:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("workerIsAlive: the health check fails only when the worker's loop is stuck", () => {
  it("is fine while the loop keeps coming round", () => {
    expect(workerIsAlive(ago(2_000), 3_600, NOW)).toBe(true);
    expect(workerIsAlive(ago(4 * 60_000), 3_600, NOW)).toBe(true);
  });

  it("is not fine when the loop has not come round for five minutes", () => {
    expect(workerIsAlive(ago(5 * 60_000 + 1), 3_600, NOW)).toBe(false);
    expect(workerIsAlive(ago(60 * 60_000), 3_600, NOW)).toBe(false);
  });

  it("gives a worker that has just started time to wake the database", () => {
    expect(workerIsAlive(null, 20, NOW)).toBe(true);
    expect(workerIsAlive(null, 119, NOW)).toBe(true);
    expect(workerIsAlive(null, 121, NOW)).toBe(false);
  });
});
