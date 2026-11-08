-- Pin look: custom pin shapes (`model PinShape`) and the look columns on LocationGroup and
-- Hotspot. Additive only (new table, new nullable / defaulted columns; no data changed or
-- dropped) and safe to run more than once. Existing pins read as the default look (circle,
-- brand logo, badge on). By hand:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/2026-11-08-pin-look.sql
--
-- Afterwards `prisma db push` reports no changes.

BEGIN;

CREATE TABLE IF NOT EXISTS "PinShape" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "anchor" TEXT NOT NULL DEFAULT 'center',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "platformId" TEXT NOT NULL DEFAULT 'wadzzo',

    CONSTRAINT "PinShape_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PinShape_platformId_idx" ON "PinShape"("platformId");
CREATE INDEX IF NOT EXISTS "PinShape_creatorId_archived_idx" ON "PinShape"("creatorId", "archived");

ALTER TABLE "LocationGroup"
    ADD COLUMN IF NOT EXISTS "markerShape" TEXT,
    ADD COLUMN IF NOT EXISTS "pinShapeId" TEXT,
    ADD COLUMN IF NOT EXISTS "markerFill" TEXT NOT NULL DEFAULT 'BRAND',
    ADD COLUMN IF NOT EXISTS "markerColor" TEXT,
    ADD COLUMN IF NOT EXISTS "markerImageFit" JSONB,
    ADD COLUMN IF NOT EXISTS "markerAutoBadge" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Hotspot"
    ADD COLUMN IF NOT EXISTS "markerShape" TEXT,
    ADD COLUMN IF NOT EXISTS "pinShapeId" TEXT,
    ADD COLUMN IF NOT EXISTS "markerFill" TEXT NOT NULL DEFAULT 'BRAND',
    ADD COLUMN IF NOT EXISTS "markerColor" TEXT,
    ADD COLUMN IF NOT EXISTS "markerImageFit" JSONB,
    ADD COLUMN IF NOT EXISTS "markerAutoBadge" BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PinShape_creatorId_fkey') THEN
        ALTER TABLE "PinShape" ADD CONSTRAINT "PinShape_creatorId_fkey"
            FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PinShape_platformId_fkey') THEN
        ALTER TABLE "PinShape" ADD CONSTRAINT "PinShape_platformId_fkey"
            FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LocationGroup_pinShapeId_fkey') THEN
        ALTER TABLE "LocationGroup" ADD CONSTRAINT "LocationGroup_pinShapeId_fkey"
            FOREIGN KEY ("pinShapeId") REFERENCES "PinShape"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Hotspot_pinShapeId_fkey') THEN
        ALTER TABLE "Hotspot" ADD CONSTRAINT "Hotspot_pinShapeId_fkey"
            FOREIGN KEY ("pinShapeId") REFERENCES "PinShape"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;
