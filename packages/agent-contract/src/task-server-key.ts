import { createHmac } from "node:crypto";

/**
 * The key the brand API sends the task server in `X-Task-Secret`, derived from
 * the NEXTAUTH_SECRET both share so the session secret itself never travels.
 * One definition for both ends; Node only (kept out of the package's main
 * entry, which browser code imports).
 */
export function taskServerKey(secret: string): string {
  return createHmac("sha256", secret).update("wadzzo-task-server").digest("hex");
}
