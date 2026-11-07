// src/routes/health.ts
import { Router, type IRouter } from "express";
import { jobCounts, type SqlDb } from "@wadzzo/jobs";

/** The loop comes round every couple of seconds; this long without it means it is stuck. */
const STUCK_AFTER_MS = 5 * 60_000;
/** A worker that has only just started may still be waking the database. */
const STARTING_SECONDS = 120;

export function workerIsAlive(lastTickAt: Date | null, uptimeSeconds: number, now = new Date()) {
  if (!lastTickAt) return uptimeSeconds <= STARTING_SECONDS;
  return now.getTime() - lastTickAt.getTime() <= STUCK_AFTER_MS;
}

export function createHealthRouter(
  db: SqlDb,
  worker: { running: () => number; lastTickAt: () => Date | null },
): IRouter {
  const router: IRouter = Router();

  // GET /health — uptime check (no auth). 503 when the worker's loop is stuck, so the host restarts it.
  router.get("/", (_req, res) => {
    void (async () => {
      const alive = workerIsAlive(worker.lastTickAt(), process.uptime());
      const jobs = await jobCounts(db).catch(() => null);
      res.status(alive ? 200 : 503).json({
        ok: alive,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        jobs,
        running: worker.running(),
        lastTickAt: worker.lastTickAt()?.toISOString() ?? null,
        timestamp: new Date().toISOString(),
      });
    })();
  });

  // GET /health/ready — readiness probe
  router.get("/ready", (_req, res) => {
    res.json({ ok: true });
  });

  return router;
}
