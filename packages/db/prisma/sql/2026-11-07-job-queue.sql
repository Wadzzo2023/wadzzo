-- The background job queue: the brand apps add rows, the worker (apps/express-wadzzo) takes them
-- one at a time with FOR UPDATE SKIP LOCKED. Additive only (one new table, no data is changed or
-- dropped) and safe to run more than once, so the worker's deploy applies it before the new image
-- starts. By hand:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/2026-11-07-job-queue.sql
--
-- Afterwards `prisma db push` reports no changes (the table is `model Job` in schema.prisma).

BEGIN;

CREATE TABLE IF NOT EXISTS "jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "creatorId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "result" JSONB,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "steps" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "jobs_status_runAt_idx" ON "jobs"("status", "runAt");
CREATE INDEX IF NOT EXISTS "jobs_type_createdAt_idx" ON "jobs"("type", "createdAt");

COMMIT;
