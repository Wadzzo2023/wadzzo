// src/workers/handlers.ts — what the worker does for each kind of job.

import type { Job as QueueJob } from "@wadzzo/jobs";
import type { Handlers } from "@wadzzo/jobs";

import { db } from "../lib/db";
import { dropDueHotspots } from "../lib/hotspot-drop";
import type { Job } from "../types/index";
import { runAgentJob } from "./agent-worker";
import { failPinJob, runCreatePinsJob } from "./create-pins-worker";

/** The agent and the pin maker only ever work for one brand; a job without one is a mistake. */
function forBrand(job: QueueJob): Job {
  if (!job.creatorId)
    throw new Error(`${job.type} job ${job.id} doesn't say which brand it is for`);
  return { id: job.id, type: job.type, creatorId: job.creatorId, payload: job.payload };
}

export const handlers: Handlers = {
  // The map agent answering one message (steps are written to the job as it works).
  agent_run: async (job) => runAgentJob(forBrand(job)),
  // A bulk pin creation the person confirmed. Never retried: a retry would double the pins.
  create_pins: async (job) => runCreatePinsJob(forBrand(job)),
  // Releases and drops whatever is due, and closes hotspots that have ended.
  hotspot_drop: async () => {
    const summary = await dropDueHotspots(db);
    if (summary.failed > 0)
      throw new Error(`${summary.failed} hotspot(s) failed: ${summary.errors.join("; ")}`);
    return summary;
  },
};

/** Called when a job has failed for good, so its own records stop waiting for it. */
export async function onGaveUp(job: QueueJob, message: string): Promise<void> {
  if (job.type === "create_pins") await failPinJob(forBrand(job), message);
}
