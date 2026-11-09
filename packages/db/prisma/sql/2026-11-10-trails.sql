-- Map trails (docs/trails): `model Trail`, `TrailStop` and `TrailRun` in schema.prisma.
-- Additive only (three new tables, no existing data is changed or dropped) and safe to run more
-- than once. By hand:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/2026-11-10-trails.sql
--
-- Afterwards `prisma db push` reports no changes.

BEGIN;

CREATE TABLE IF NOT EXISTS "Trail" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImage" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'WALK',
    "order" TEXT NOT NULL DEFAULT 'ORDERED',
    "color" TEXT,
    "path" JSONB NOT NULL,
    "distanceMetres" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estMinutes" INTEGER NOT NULL DEFAULT 0,
    "minLat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxLat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minLng" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxLng" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reviewNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "stopDefaults" JSONB,
    "rewardGroupId" TEXT,
    "rewardMinStops" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "platformId" TEXT NOT NULL DEFAULT 'wadzzo',

    CONSTRAINT "Trail_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TrailStop" (
    "id" TEXT NOT NULL,
    "trailId" TEXT NOT NULL,
    "locationGroupId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "clue" TEXT,

    CONSTRAINT "TrailStop_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TrailRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trailId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "rewardConsumerId" TEXT,
    "platformId" TEXT NOT NULL DEFAULT 'wadzzo',

    CONSTRAINT "TrailRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Trail_rewardGroupId_key" ON "Trail"("rewardGroupId");
CREATE INDEX IF NOT EXISTS "Trail_platformId_idx" ON "Trail"("platformId");
CREATE INDEX IF NOT EXISTS "Trail_creatorId_status_idx" ON "Trail"("creatorId", "status");
CREATE INDEX IF NOT EXISTS "Trail_status_minLat_maxLat_idx" ON "Trail"("status", "minLat", "maxLat");
CREATE INDEX IF NOT EXISTS "TrailStop_locationGroupId_idx" ON "TrailStop"("locationGroupId");
CREATE UNIQUE INDEX IF NOT EXISTS "TrailStop_trailId_position_key" ON "TrailStop"("trailId", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "TrailStop_trailId_locationGroupId_key" ON "TrailStop"("trailId", "locationGroupId");
CREATE UNIQUE INDEX IF NOT EXISTS "TrailRun_rewardConsumerId_key" ON "TrailRun"("rewardConsumerId");
CREATE INDEX IF NOT EXISTS "TrailRun_trailId_completedAt_idx" ON "TrailRun"("trailId", "completedAt");
CREATE INDEX IF NOT EXISTS "TrailRun_platformId_idx" ON "TrailRun"("platformId");
CREATE UNIQUE INDEX IF NOT EXISTS "TrailRun_userId_trailId_key" ON "TrailRun"("userId", "trailId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Trail_creatorId_fkey') THEN
        ALTER TABLE "Trail" ADD CONSTRAINT "Trail_creatorId_fkey"
            FOREIGN KEY ("creatorId")
            REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Trail_rewardGroupId_fkey') THEN
        ALTER TABLE "Trail" ADD CONSTRAINT "Trail_rewardGroupId_fkey"
            FOREIGN KEY ("rewardGroupId")
            REFERENCES "LocationGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Trail_platformId_fkey') THEN
        ALTER TABLE "Trail" ADD CONSTRAINT "Trail_platformId_fkey"
            FOREIGN KEY ("platformId")
            REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrailStop_trailId_fkey') THEN
        ALTER TABLE "TrailStop" ADD CONSTRAINT "TrailStop_trailId_fkey"
            FOREIGN KEY ("trailId")
            REFERENCES "Trail"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrailStop_locationGroupId_fkey') THEN
        ALTER TABLE "TrailStop" ADD CONSTRAINT "TrailStop_locationGroupId_fkey"
            FOREIGN KEY ("locationGroupId")
            REFERENCES "LocationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrailRun_userId_fkey') THEN
        ALTER TABLE "TrailRun" ADD CONSTRAINT "TrailRun_userId_fkey"
            FOREIGN KEY ("userId")
            REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrailRun_trailId_fkey') THEN
        ALTER TABLE "TrailRun" ADD CONSTRAINT "TrailRun_trailId_fkey"
            FOREIGN KEY ("trailId")
            REFERENCES "Trail"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrailRun_rewardConsumerId_fkey') THEN
        ALTER TABLE "TrailRun" ADD CONSTRAINT "TrailRun_rewardConsumerId_fkey"
            FOREIGN KEY ("rewardConsumerId")
            REFERENCES "LocationConsumer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrailRun_platformId_fkey') THEN
        ALTER TABLE "TrailRun" ADD CONSTRAINT "TrailRun_platformId_fkey"
            FOREIGN KEY ("platformId")
            REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;
