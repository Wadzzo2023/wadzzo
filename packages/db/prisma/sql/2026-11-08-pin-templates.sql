-- Pin templates: a brand's saved pin / hotspot setups (`model PinTemplate` in schema.prisma).
-- Additive only (one new table, no data is changed or dropped) and safe to run more than once.
-- By hand:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/2026-11-08-pin-templates.sql
--
-- Afterwards `prisma db push` reports no changes.

BEGIN;

CREATE TABLE IF NOT EXISTS "PinTemplate" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formType" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "hasLocation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "platformId" TEXT NOT NULL DEFAULT 'wadzzo',

    CONSTRAINT "PinTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PinTemplate_platformId_idx" ON "PinTemplate"("platformId");
CREATE INDEX IF NOT EXISTS "PinTemplate_creatorId_formType_updatedAt_idx"
    ON "PinTemplate"("creatorId", "formType", "updatedAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PinTemplate_creatorId_fkey') THEN
        ALTER TABLE "PinTemplate" ADD CONSTRAINT "PinTemplate_creatorId_fkey"
            FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PinTemplate_platformId_fkey') THEN
        ALTER TABLE "PinTemplate" ADD CONSTRAINT "PinTemplate_platformId_fkey"
            FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;
