// The brand app's side of the worker queue (packages/jobs). Long work — the map agent, bulk pin
// creation — is added as a job here and the worker (apps/express-wadzzo) takes it from the same
// database; the app then reads its progress. Nothing is called over the network, so there is no
// address to set. Callers must check the user may act for `creatorId` first.

import { enqueueJob, getJob, type JobType, type SqlDb } from "@wadzzo/jobs";
import { AppError, ErrorCodes } from "@wadzzo/errors";

export type { JobType };
export type JobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export interface PollResult {
  jobId: string;
  /** The brand the job runs for — check the caller may see it before returning anything. */
  creatorId: string;
  status: JobStatus;
  result: unknown;
  error?: string;
  progress: number;
  /** agent_run: what the agent is doing (AgentStep[]). */
  steps?: unknown[];
}

const STATUS = {
  QUEUED: "pending",
  RUNNING: "processing",
  SUCCEEDED: "completed",
  FAILED: "failed",
} as const satisfies Record<string, JobStatus>;

export function jobQueue(db: SqlDb) {
  return {
    /** Add a job — returns { jobId } at once (no waiting). One attempt unless told otherwise. */
    async enqueue(
      type: JobType,
      creatorId: string,
      payload: Record<string, unknown>,
      maxAttempts = 1,
    ): Promise<{ jobId: string }> {
      const job = await enqueueJob(db, { type, creatorId, payload, maxAttempts });
      return { jobId: job.id };
    },

    /** Read a job once. */
    async poll(jobId: string): Promise<PollResult> {
      const job = await getJob(db, jobId);
      if (!job?.creatorId)
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Job not found" });
      return {
        jobId: job.id,
        creatorId: job.creatorId,
        status: STATUS[job.status],
        result: job.result ?? undefined,
        error: job.lastError ?? undefined,
        progress: job.progress,
        steps: job.steps ?? undefined,
      };
    },
  };
}
