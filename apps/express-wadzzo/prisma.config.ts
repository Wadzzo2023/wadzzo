import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * The database schema is owned by `@wadzzo/db` (packages/db). This service
 * generates its client from that one file; it never has a schema copy of its own.
 */
export default defineConfig({
  schema: "../../packages/db/prisma/schema.prisma",
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://not-configured:not-configured@localhost:5432/not-configured",
  },
});
