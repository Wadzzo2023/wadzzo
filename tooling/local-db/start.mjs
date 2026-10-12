// pnpm db:local  →  Postgres on 127.0.0.1:54329 with packages/db's schema and the two platform rows.
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/postgres DATABASE_POOL_MAX=1
// The data lives in memory: it is gone when you stop the process.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPackage = path.resolve(here, "../../packages/db");
const PORT = Number(process.env.LOCAL_DB_PORT ?? 54329);

console.log("[local-db] generating SQL from packages/db/prisma/schema.prisma …");
const sql = execFileSync(
  "pnpm",
  [
    "exec",
    "prisma",
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema",
    "prisma/schema.prisma",
    "--script",
  ],
  { cwd: dbPackage, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

const db = await PGlite.create();
await db.exec(sql);

// The platforms every deployment needs (see packages/platform/src/branding).
await db.exec(`
  INSERT INTO "Platform" ("id","name","isRoot","webUrl","brandUrl","active","createdAt","updatedAt") VALUES
    ('wadzzo','Wadzzo',true,'http://localhost:3000','http://localhost:3001',true,now(),now()),
    ('clintoncounty','Clinton City',false,'http://localhost:3000','http://localhost:3001',true,now(),now())
  ON CONFLICT DO NOTHING;
`);

const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1" });
await server.start();
console.log(`[local-db] ready: postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`);
console.log(
  "[local-db] one connection at a time: run apps with DATABASE_POOL_MAX=1, one app per database.",
);
