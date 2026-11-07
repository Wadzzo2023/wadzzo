import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite, types } from "@electric-sql/pglite";

import type { SqlDb } from "./queue";

/** The very SQL file the deploy applies, so the table and the statements are tested together. */
export const JOB_TABLE_SQL = readFileSync(
  join(import.meta.dirname, "../../db/prisma/sql/2026-11-07-job-queue.sql"),
  "utf8",
);

/**
 * A real Postgres (PGlite, inside this process) with the jobs table, wearing the two raw-query
 * methods a Prisma client has. `timestamp` has no zone; Prisma reads it as UTC, so do the same here
 * whatever this machine's zone is.
 */
export async function testDb() {
  const pg = new PGlite({
    parsers: { [types.TIMESTAMP]: (value: string) => new Date(`${value.replace(" ", "T")}Z`) },
  });
  await pg.exec(JOB_TABLE_SQL);
  const db: SqlDb = {
    $queryRawUnsafe: async <T>(sql: string, ...values: unknown[]) =>
      (await pg.query(sql, values)).rows as T,
    $executeRawUnsafe: async (sql: string, ...values: unknown[]) =>
      (await pg.query(sql, values)).affectedRows ?? 0,
  };
  return { pg, db };
}
