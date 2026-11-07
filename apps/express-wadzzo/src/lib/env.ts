import { z } from "zod";

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

/** Every environment variable the worker reads, with its type and default. */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: positiveInt(4000),
  /** Required by the database client (checked where it connects, so tests can import without it). */
  DATABASE_URL: z.string().optional(),
  /** How long one job may run before it is cancelled. */
  JOB_TIMEOUT_MS: positiveInt(300_000),
  WORKER_CONCURRENCY: positiveInt(5),
  LOG_LEVEL: z.string().optional(),
  AGENT_MODEL: z.string().default("gpt-5.4-mini"),
  GOOGLE_MAP_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

export type TaskServerEnv = z.infer<typeof envSchema>;

/**
 * The validated environment. Read lazily, key by key, so the values follow
 * `process.env` at the moment they are used (tests change it between calls).
 */
export const env = Object.defineProperties(
  {} as TaskServerEnv,
  Object.fromEntries(
    Object.keys(envSchema.shape).map((key) => [
      key,
      { enumerable: true, get: () => envSchema.parse(process.env)[key as keyof TaskServerEnv] },
    ]),
  ),
);
