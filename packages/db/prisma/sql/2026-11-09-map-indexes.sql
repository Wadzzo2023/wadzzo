-- Indexes the brand map needs. Loading a brand's pins joins Location → LocationGroup and counts
-- each pin's collectors (LocationConsumer), and filters groups by brand and end date; none of
-- those columns had an index, so the cost grew with every pin in the table, not just the brand's.
-- Additive only (three indexes; no data is changed) and safe to run more than once. By hand:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/2026-11-09-map-indexes.sql
--
-- On a very large production table, build each one CONCURRENTLY instead (outside a transaction,
-- one statement at a time) so writes aren't blocked while it builds:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "Location_locationGroupId_idx" ON "Location"("locationGroupId");
--
-- Afterwards `prisma db push` reports no changes (they are @@index lines in schema.prisma).

BEGIN;

CREATE INDEX IF NOT EXISTS "Location_locationGroupId_idx" ON "Location"("locationGroupId");
CREATE INDEX IF NOT EXISTS "LocationConsumer_locationId_idx" ON "LocationConsumer"("locationId");
CREATE INDEX IF NOT EXISTS "LocationGroup_creatorId_endDate_idx" ON "LocationGroup"("creatorId", "endDate");

COMMIT;
