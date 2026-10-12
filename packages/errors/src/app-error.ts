import { ERROR_DEFINITIONS, isErrorCode, type ErrorCode } from "./error-codes";

export interface AppErrorOptions {
  /** A message safe to show to the user; defaults to the code's standard one. */
  message?: string;
  /** Machine-readable extra context (never secrets). */
  details?: Record<string, unknown>;
  /** The lower-level error that caused this one. */
  cause?: unknown;
}

/** The one error type the platform throws on purpose. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? ERROR_DEFINITIONS[code].message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_DEFINITIONS[code].status;
    this.details = options.details;
  }

  /** The `{ error: { code, message } }` body used by HTTP routes. */
  toJSON() {
    return { error: { code: this.code, message: this.message } };
  }
}

export const isAppError = (error: unknown): error is AppError =>
  error instanceof AppError ||
  (error instanceof Error && error.name === "AppError" && isErrorCode((error as AppError).code));

/** Wraps anything that was thrown into an AppError (unknown things become INTERNAL). */
export function toAppError(error: unknown, fallback: ErrorCode = "INTERNAL"): AppError {
  if (isAppError(error)) return error;
  const message = error instanceof Error ? error.message : undefined;
  return new AppError(fallback, { cause: error, ...(message ? { details: { original: message } } : {}) });
}

/** A setting a feature needs; throws CONFIG_MISSING naming the variable. */
export function requireEnv(name: string, value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new AppError("CONFIG_MISSING", {
      message: `Missing required environment variable ${name}.`,
      details: { name },
    });
  }
  return value;
}
