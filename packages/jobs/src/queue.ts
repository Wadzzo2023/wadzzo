import { randomUUID } from "node:crypto";

/**
 * The background job queue (the `jobs` table; see prisma/sql/2026-11-07-job-queue.sql).
 *
 * The brand apps add jobs and read their progress; the task server's worker (apps/express-wadzzo)
 * takes them one at a time with FOR UPDATE SKIP LOCKED, so two copies of the worker never run the
 * same job. Neither side calls the other: the database is the only link.
 *
 * The functions use plain SQL through the two raw-query methods every Prisma client has, so the
 * brand apps' client and the worker's client can both use them.
 */
export interface SqlDb {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export type JobType = "agent_run" | "create_pins" | "hotspot_drop";
export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface Job {
  id: string;
  type: string;
  creatorId: string | null;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  result: unknown;
  progress: number;
  steps: unknown[] | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A failed job waits longer each time (1, 5, 15, 60 minutes) and gives up after `maxAttempts`. */
export const RETRY_MINUTES = [1, 5, 15, 60] as const;

/**
 * A job still RUNNING this long after its worker last touched it belonged to a worker that died.
 * A live worker touches its job every `HEARTBEAT_MS`, however long the job takes.
 */
export const STALE_AFTER_MS = 5 * 60_000;
export const HEARTBEAT_MS = 30_000;

const iso = (date: Date) => date.toISOString();

/**
 * Adds a job. With `dedupe`, a job of the same type and payload that is still waiting or running
 * is reused instead (one hotspot look at a time, however slow the last one was).
 */
export async function enqueueJob(
  db: SqlDb,
  input: {
    type: JobType;
    creatorId?: string;
    payload?: Record<string, unknown>;
    runAt?: Date;
    dedupe?: boolean;
    maxAttempts?: number;
  },
  now = new Date(),
): Promise<Job> {
  const payload = JSON.stringify(input.payload ?? {});
  if (input.dedupe) {
    const existing = await db.$queryRawUnsafe<Job[]>(
      `SELECT * FROM jobs WHERE type = $1 AND status IN ('QUEUED', 'RUNNING') AND payload = $2::jsonb
       ORDER BY "createdAt" LIMIT 1`,
      input.type,
      payload,
    );
    if (existing[0]) return existing[0];
  }
  const rows = await db.$queryRawUnsafe<Job[]>(
    `INSERT INTO jobs (id, type, "creatorId", payload, "maxAttempts", "runAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4::jsonb, $5, $6::timestamp, $7::timestamp, $7::timestamp)
     RETURNING *`,
    randomUUID(),
    input.type,
    input.creatorId ?? null,
    payload,
    input.maxAttempts ?? 1,
    iso(input.runAt ?? now),
    iso(now),
  );
  return rows[0]!;
}

/** Takes the next due job of a type this worker knows, or null when there is none. */
export async function claimJob(
  db: SqlDb,
  workerId: string,
  types: readonly string[],
  now = new Date(),
): Promise<Job | null> {
  const rows = await db.$queryRawUnsafe<Job[]>(
    `UPDATE jobs SET status = 'RUNNING', "lockedAt" = $1::timestamp, "lockedBy" = $2,
            attempts = attempts + 1, "updatedAt" = $1::timestamp
     WHERE id = (
       SELECT id FROM jobs
       WHERE status = 'QUEUED' AND "runAt" <= $1::timestamp AND type = ANY($3::text[])
       ORDER BY "runAt", "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    iso(now),
    workerId,
    [...types],
  );
  return rows[0] ?? null;
}

export async function getJob(db: SqlDb, id: string): Promise<Job | null> {
  const rows = await db.$queryRawUnsafe<Job[]>(`SELECT * FROM jobs WHERE id = $1`, id);
  return rows[0] ?? null;
}

export async function completeJob(db: SqlDb, id: string, result?: unknown, now = new Date()) {
  await db.$executeRawUnsafe(
    `UPDATE jobs SET status = 'SUCCEEDED', result = $2::jsonb, progress = 100, "lastError" = NULL,
            "lockedAt" = NULL, "lockedBy" = NULL, "updatedAt" = $3::timestamp
     WHERE id = $1`,
    id,
    JSON.stringify(result ?? null),
    iso(now),
  );
}

/** When a failed job runs next, or null when it has used its attempts. */
export function retryAt(attempts: number, maxAttempts: number, now = new Date()): Date | null {
  if (attempts >= maxAttempts) return null;
  const minutes = RETRY_MINUTES[Math.min(attempts, RETRY_MINUTES.length) - 1] ?? 60;
  return new Date(now.getTime() + minutes * 60_000);
}

/** Records the error and either schedules a retry or gives up. */
export async function failJob(
  db: SqlDb,
  job: Pick<Job, "id" | "attempts" | "maxAttempts">,
  error: unknown,
  now = new Date(),
) {
  const next = retryAt(job.attempts, job.maxAttempts, now);
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  await db.$executeRawUnsafe(
    `UPDATE jobs SET status = $2, "runAt" = COALESCE($3::timestamp, "runAt"), "lastError" = $4,
            "lockedAt" = NULL, "lockedBy" = NULL, "updatedAt" = $5::timestamp
     WHERE id = $1`,
    job.id,
    next ? "QUEUED" : "FAILED",
    next ? iso(next) : null,
    message,
    iso(now),
  );
  return { retryAt: next };
}

/** The worker says it is still alive and on this job. */
export async function heartbeatJob(db: SqlDb, id: string, now = new Date()) {
  await db.$executeRawUnsafe(
    `UPDATE jobs SET "lockedAt" = $2::timestamp WHERE id = $1 AND status = 'RUNNING'`,
    id,
    iso(now),
  );
}

/** What the map agent is doing (steps) and how far along a job is, for whoever is watching. */
export async function setJobProgress(
  db: SqlDb,
  id: string,
  update: { steps?: unknown[]; progress?: number },
  now = new Date(),
) {
  await db.$executeRawUnsafe(
    `UPDATE jobs SET steps = COALESCE($2::jsonb, steps), progress = COALESCE($3, progress),
            "updatedAt" = $4::timestamp
     WHERE id = $1`,
    id,
    update.steps ? JSON.stringify(update.steps) : null,
    update.progress === undefined ? null : Math.min(100, Math.max(0, Math.round(update.progress))),
    iso(now),
  );
}

const STOPPED = "The worker stopped while this was running. It isn't run again automatically.";

/**
 * Deals with jobs whose worker stopped mid-run, so none stays RUNNING for ever: one with attempts
 * left goes back in the queue; one that has used them all (a job meant to run once, like making
 * pins) is marked FAILED and never run a second time. The failed ones are returned, so whoever owns
 * their records (a pin batch's card) can close them too.
 */
export async function releaseStaleJobs(
  db: SqlDb,
  now = new Date(),
  staleAfterMs = STALE_AFTER_MS,
): Promise<{ requeued: number; failed: Job[] }> {
  const cutoff = iso(new Date(now.getTime() - staleAfterMs));
  const failed = await db.$queryRawUnsafe<Job[]>(
    `UPDATE jobs SET status = 'FAILED', "lockedAt" = NULL, "lockedBy" = NULL, "updatedAt" = $2::timestamp,
            "lastError" = $3
     WHERE status = 'RUNNING' AND "lockedAt" < $1::timestamp AND attempts >= "maxAttempts"
     RETURNING *`,
    cutoff,
    iso(now),
    STOPPED,
  );
  const requeued = await db.$executeRawUnsafe(
    `UPDATE jobs SET status = 'QUEUED', "lockedAt" = NULL, "lockedBy" = NULL, "runAt" = $2::timestamp,
            "updatedAt" = $2::timestamp
     WHERE status = 'RUNNING' AND "lockedAt" < $1::timestamp AND attempts < "maxAttempts"`,
    cutoff,
    iso(now),
  );
  return { requeued, failed };
}

/** How many jobs are in each state, for the health check. */
export async function jobCounts(db: SqlDb) {
  const rows = await db.$queryRawUnsafe<{ status: JobStatus; n: number | bigint | string }[]>(
    `SELECT status, count(*) AS n FROM jobs GROUP BY status`,
  );
  const counts = { queued: 0, running: 0, succeeded: 0, failed: 0 };
  for (const row of rows) {
    const key = row.status.toLowerCase() as keyof typeof counts;
    if (key in counts) counts[key] = Number(row.n);
  }
  return counts;
}
