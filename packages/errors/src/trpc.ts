import { TRPCError } from "@trpc/server";

import { isAppError } from "./app-error";
import { ERROR_DEFINITIONS } from "./error-codes";

/** `throw toTRPCError(new AppError(...))`: keeps the app code on `error.cause`. */
export function toTRPCError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  if (isAppError(error)) {
    return new TRPCError({
      code: ERROR_DEFINITIONS[error.code].trpc,
      message: error.message,
      cause: error,
    });
  }
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: error });
}

/**
 * Adds `data.appCode` to every tRPC error response so clients can branch on a
 * stable code instead of parsing messages. Use inside the `errorFormatter`:
 *
 *   errorFormatter: ({ shape, error }) => withAppCode(shape, error)
 */
export function withAppCode<S extends { data: object }>(shape: S, error: { cause?: unknown }) {
  const appCode = isAppError(error.cause) ? error.cause.code : null;
  return { ...shape, data: { ...shape.data, appCode } };
}
