import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "./env";

/** Neon databases sleep when idle; give a cold start time to wake. */
const CONNECTION_TIMEOUT_MS = 30_000;

const connectionString = env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    }),
    log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
