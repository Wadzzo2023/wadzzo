import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 reads the connection URL here instead of from schema.prisma.
 * The app's own client connects through the pg driver adapter in src/client.ts;
 * this is for the CLI (generate, studio, push).
 *
 * `prisma generate` needs no database, so a missing DATABASE_URL must not stop
 * `pnpm install`; commands that do connect fail on the placeholder instead.
 */
const NO_DATABASE = "postgresql://not-configured:not-configured@localhost:5432/not-configured";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: process.env.DATABASE_URL ?? NO_DATABASE },
});
