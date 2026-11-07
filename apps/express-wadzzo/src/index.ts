import "dotenv/config";
import { hostname } from "node:os";
import express, { type Express, type RequestHandler } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { startWorker } from "@wadzzo/jobs";

import { db } from "./lib/db";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { createHealthRouter } from "./routes/health";
import { handlers, onGaveUp } from "./workers/handlers";
import { startSchedules } from "./workers/schedule";

/**
 * The Wadzzo worker. The brand apps never call it: they add jobs to the `jobs` table and read the
 * result there, and this process takes the jobs from the table (the map agent, bulk pin creation,
 * hotspot drops). The only thing it serves is /health, for the host and the watchdog.
 */
const app: Express = express();
const PORT = env.PORT;
app.set("trust proxy", 1);

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
const helmetMw = helmet() as RequestHandler;
const morganMw = morgan("combined", {
  stream: { write: (msg: string) => logger.http(msg.trim()) },
  skip: (req: express.Request) => req.url === "/health" || req.url === "/health/ready",
}) as RequestHandler;
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */

// ── The worker ───────────────────────────────────────────────────────────────
const worker = startWorker(db, {
  workerId: `${hostname()}-${process.pid}`,
  handlers,
  concurrency: env.WORKER_CONCURRENCY,
  timeoutMs: env.JOB_TIMEOUT_MS,
  onGaveUp,
  onError: (error) => logger.error(`[worker] ${String(error)}`),
});
const stopSchedules = startSchedules(db, undefined, (error) =>
  logger.error(`[worker] couldn't schedule: ${String(error)}`),
);

app.use(helmetMw);
app.use(morganMw);
app.use("/health", createHealthRouter(db, worker));
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("[express] Unhandled error:", err.message, err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// ── Graceful error handling ──────────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  logger.error(`[process] Uncaught exception: ${err.message}\n${err.stack ?? ""}`);
});
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  logger.error(`[process] Unhandled rejection: ${msg}`);
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
// Take no new job, let the ones in hand finish (the deploy waits up to 120 s), then leave.
// A job that doesn't finish in time stays RUNNING and is dealt with by the next worker.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[process] ${signal} received — finishing the jobs in hand`);
  stopSchedules();
  const giveUp = setTimeout(() => {
    logger.warn("[process] Jobs still running after 100s — leaving them for the next worker");
    process.exit(1);
  }, 100_000);
  await worker.stop();
  clearTimeout(giveUp);
  server.close(() => {
    logger.info("[process] Stopped");
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2_000);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

const server = app.listen(PORT, () => {
  logger.info(`✓ Worker running (${env.NODE_ENV}); health on port ${PORT}`);
});

export default app;
