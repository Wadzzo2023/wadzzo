import { taskServerKey } from "@wadzzo/agent-contract/task-server-key";
import { env } from "../../../env";
import { AppError, ErrorCodes, isProductionDeployment } from "@wadzzo/errors";

const PRODUCTION_URL = "https://wadzzo.54-69-28-110.sslip.io";

/**
 * Base URL of the Express task server. The production deployment falls back to
 * the live server; everywhere else (local, the dev domains, previews) it must
 * be set, so testing never writes to production by accident.
 */
export function taskServerUrl() {
  const url = env.EXPRESS_SERVER_URL ?? (isProductionDeployment() ? PRODUCTION_URL : undefined);
  if (!url)
    throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
      message:
        "The task server isn't configured for this environment. Run apps/express-wadzzo against this environment's database and set EXPRESS_SERVER_URL (e.g. http://localhost:4000).",
    });
  return url.replace(/\/$/, "");
}

/** Headers for every task-server call: JSON, plus the key it requires. */
export function taskServerHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.NEXTAUTH_SECRET) headers["X-Task-Secret"] = taskServerKey(env.NEXTAUTH_SECRET);
  return headers;
}
