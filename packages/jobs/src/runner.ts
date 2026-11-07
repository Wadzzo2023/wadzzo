import {
  HEARTBEAT_MS,
  STALE_AFTER_MS,
  claimJob,
  completeJob,
  failJob,
  heartbeatJob,
  releaseStaleJobs,
  type Job,
  type SqlDb,
} from "./queue";

/** What one job type does. What it returns is stored on the job; throwing fails (or retries) it. */
export type Handlers = Record<string, (job: Job) => Promise<unknown>>;

export interface RunOptions {
  /** A job running longer than this is failed. The handler is not stopped, only given up on. */
  timeoutMs?: number;
  heartbeatMs?: number;
  /** Called once a job has failed for good (no attempts left), so its own records can be closed. */
  onGaveUp?: (job: Job, message: string) => Promise<void>;
  hooks?: { started?: (job: Job) => void; finished?: (job: Job) => void };
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Takes one due job, runs its handler, and records how it went. Returns whether it did any work.
 * While the handler runs, the database is told every few seconds that this worker is alive, so a
 * long job is never mistaken for one whose worker died.
 */
export async function runOnce(
  db: SqlDb,
  workerId: string,
  handlers: Handlers,
  options: RunOptions = {},
): Promise<boolean> {
  const job = await claimJob(db, workerId, Object.keys(handlers));
  if (!job) return false;

  options.hooks?.started?.(job);
  const beat = setInterval(
    () => void heartbeatJob(db, job.id).catch(() => undefined),
    options.heartbeatMs ?? HEARTBEAT_MS,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = handlers[job.type]!(job);
    const timeout = options.timeoutMs
      ? new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Job timed out after ${options.timeoutMs}ms`)),
            options.timeoutMs,
          );
        })
      : null;
    const result = await (timeout ? Promise.race([run, timeout]) : run);
    await completeJob(db, job.id, result);
  } catch (error) {
    const message = messageOf(error);
    const { retryAt } = await failJob(db, job, error);
    if (!retryAt && options.onGaveUp) await options.onGaveUp(job, message).catch(() => undefined);
  } finally {
    clearInterval(beat);
    clearTimeout(timer);
    options.hooks?.finished?.(job);
  }
  return true;
}

export interface WorkerOptions extends RunOptions {
  workerId: string;
  handlers: Handlers;
  /** How many jobs this worker runs at once. */
  concurrency: number;
  /** How long to rest when there is nothing to do. */
  idleMs?: number;
  /** How often to put back jobs a dead worker left running. */
  maintenanceMs?: number;
  onError?: (error: unknown) => void;
}

/**
 * The loops: `concurrency` of them, each working while there is work and resting when there isn't.
 * `stop()` takes no new job and waits for the ones in hand, so a redeploy never cuts a job short.
 */
export function startWorker(db: SqlDb, options: WorkerOptions) {
  const idleMs = options.idleMs ?? 2_000;
  const onError = options.onError ?? ((error) => console.error("[worker]", error));
  let stopped = false;
  let running = 0;
  let lastTickAt: Date | null = null;

  const runOptions: RunOptions = {
    ...options,
    hooks: {
      started: (job) => {
        running++;
        options.hooks?.started?.(job);
      },
      finished: (job) => {
        running--;
        options.hooks?.finished?.(job);
      },
    },
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const loop = async () => {
    while (!stopped) {
      lastTickAt = new Date();
      let worked = false;
      try {
        worked = await runOnce(db, options.workerId, options.handlers, runOptions);
      } catch (error) {
        // The database blinked: say so, wait, and carry on rather than crash the process.
        onError(error);
      }
      if (!worked && !stopped) await sleep(idleMs);
    }
  };

  const tidy = () =>
    void releaseStaleJobs(db, new Date(), STALE_AFTER_MS).catch((error: unknown) => onError(error));
  tidy();
  const maintenance = setInterval(tidy, options.maintenanceMs ?? 30_000);

  const loops = Array.from({ length: Math.max(1, options.concurrency) }, () => loop());

  return {
    running: () => running,
    lastTickAt: () => lastTickAt,
    stop: async () => {
      stopped = true;
      clearInterval(maintenance);
      await Promise.all(loops);
    },
  };
}
