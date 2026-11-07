// src/workers/schedule.ts — jobs that run on a clock rather than when something happens.

import { enqueueJob, type JobType, type SqlDb } from "@wadzzo/jobs";

export const SCHEDULES: { type: JobType; everyMs: number }[] = [
  // Release the first drop of hotspots that have started, drop for slots that have come, and close
  // hotspots that have ended (see lib/hotspot-drop.ts).
  { type: "hotspot_drop", everyMs: 5 * 60_000 },
];

/**
 * Adds each scheduled job when it is due. `dedupe` means a look still waiting or running isn't
 * doubled, so a slow one never piles up behind itself. Returns a function that stops the clock.
 */
export function startSchedules(
  db: SqlDb,
  schedules = SCHEDULES,
  onError: (error: unknown) => void = (error) => console.error("[worker] couldn't schedule", error),
) {
  const timers = schedules.map(({ type, everyMs }) => {
    const add = () =>
      void enqueueJob(db, { type, dedupe: true, maxAttempts: 1 }).catch((error: unknown) =>
        onError(error),
      );
    add();
    return setInterval(add, everyMs);
  });
  return () => timers.forEach((timer) => clearInterval(timer));
}
