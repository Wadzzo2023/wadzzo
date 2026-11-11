-- Map layers (docs/layers): `model PinLayer`, `LocationGroup.layerId` and `Hotspot.layerId` in
-- schema.prisma, plus `Trail.layerId`. Brands make their own layers (Hospital, School…) on the
-- base map and put their pins, hotspots and trails in them.
-- Additive only (one new table, three nullable columns, indexes and foreign keys; no data changes)
-- and safe to run more than once. Run it before deploying the code that reads `layerId`. By hand:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/2026-11-11-pin-layers.sql
--
-- Afterwards `prisma db push` reports no changes (apart from the older jobs.updatedAt default).

BEGIN;

CREATE TABLE IF NOT EXISTS "PinLayer" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PinLayer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PinLayer_creatorId_idx" ON "PinLayer"("creatorId");
CREATE INDEX IF NOT EXISTS "PinLayer_platformId_idx" ON "PinLayer"("platformId");

ALTER TABLE "LocationGroup" ADD COLUMN IF NOT EXISTS "layerId" TEXT;
ALTER TABLE "Hotspot" ADD COLUMN IF NOT EXISTS "layerId" TEXT;
ALTER TABLE "Trail" ADD COLUMN IF NOT EXISTS "layerId" TEXT;

CREATE INDEX IF NOT EXISTS "LocationGroup_layerId_idx" ON "LocationGroup"("layerId");
CREATE INDEX IF NOT EXISTS "Trail_layerId_idx" ON "Trail"("layerId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PinLayer_platformId_fkey') THEN
    ALTER TABLE "PinLayer"
      ADD CONSTRAINT "PinLayer_platformId_fkey" FOREIGN KEY ("platformId")
      REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PinLayer_creatorId_fkey') THEN
    ALTER TABLE "PinLayer"
      ADD CONSTRAINT "PinLayer_creatorId_fkey" FOREIGN KEY ("creatorId")
      REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LocationGroup_layerId_fkey') THEN
    ALTER TABLE "LocationGroup"
      ADD CONSTRAINT "LocationGroup_layerId_fkey" FOREIGN KEY ("layerId")
      REFERENCES "PinLayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Trail_layerId_fkey') THEN
    ALTER TABLE "Trail"
      ADD CONSTRAINT "Trail_layerId_fkey" FOREIGN KEY ("layerId")
      REFERENCES "PinLayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Hotspot_layerId_fkey') THEN
    ALTER TABLE "Hotspot"
      ADD CONSTRAINT "Hotspot_layerId_fkey" FOREIGN KEY ("layerId")
      REFERENCES "PinLayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
