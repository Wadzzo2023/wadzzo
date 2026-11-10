-- Trail-owned stop pins (docs/trails): `LocationGroup.trailOwnerId` in schema.prisma. A pin made
-- as a new stop in a trail's builder is created when the trail is saved and belongs to it.
-- Additive only (one nullable column, an index and a foreign key; no data changes) and safe to
-- run more than once. By hand:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/2026-11-10-trail-owned-pins.sql
--
-- Afterwards `prisma db push` reports no changes.

BEGIN;

ALTER TABLE "LocationGroup" ADD COLUMN IF NOT EXISTS "trailOwnerId" TEXT;

CREATE INDEX IF NOT EXISTS "LocationGroup_trailOwnerId_idx" ON "LocationGroup"("trailOwnerId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LocationGroup_trailOwnerId_fkey'
  ) THEN
    ALTER TABLE "LocationGroup"
      ADD CONSTRAINT "LocationGroup_trailOwnerId_fkey" FOREIGN KEY ("trailOwnerId")
      REFERENCES "Trail"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
