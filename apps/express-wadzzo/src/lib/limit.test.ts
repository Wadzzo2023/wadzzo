import { describe, expect, it } from "vitest";

import { pLimit } from "./limit";

describe("pLimit", () => {
  it("never runs more tasks at once than its limit, and returns results in order", async () => {
    const limit = pLimit(2);
    let active = 0;
    let maxActive = 0;

    const task = (id: number) =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 30));
        active--;
        return id;
      });

    const results = await Promise.all([task(1), task(2), task(3), task(4), task(5)]);
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("keeps going after a task fails", async () => {
    const limit = pLimit(2);
    await expect(
      limit(async () => {
        throw new Error("Task failed");
      }),
    ).rejects.toThrow("Task failed");
    expect(await limit(async () => "recovered")).toBe("recovered");
  });
});
