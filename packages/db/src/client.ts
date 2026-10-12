import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { requireEnv } from "@wadzzo/errors";

/** Neon databases sleep when idle; give a cold start time to wake. */
const CONNECTION_TIMEOUT_MS = 30_000;

/**
 * Prisma 7 connects through a driver adapter (node-postgres) instead of the
 * old Rust query engine's own connection. One client per process; in dev it
 * survives hot reloads on globalThis.
 */
function createDbClient() {
  const isBuildWithoutEnv = process.env.SKIP_ENV_VALIDATION === "1" || process.env.SKIP_ENV_VALIDATION === "true";
  const connectionString = isBuildWithoutEnv
    ? process.env.DATABASE_URL
    : requireEnv("DATABASE_URL", process.env.DATABASE_URL);

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS }),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Secret keys are never loaded unless a query asks for them by name
    // (`select: { storageSecret: true }`), so a stray `include: { creator: true }`
    // can't send them to the browser.
    omit: {
      creator: { storageSecret: true },
      creatorPageAsset: { issuerPrivate: true },
      asset: { issuerPrivate: true },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  wadzzoDb: ReturnType<typeof createDbClient> | undefined;
};

export const db = globalForPrisma.wadzzoDb ?? createDbClient();

/** The shared client's type (with the secret omits), for helpers that take `db`. */
export type Db = typeof db;

if (process.env.NODE_ENV !== "production") globalForPrisma.wadzzoDb = db;
