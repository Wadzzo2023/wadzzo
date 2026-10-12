import { TRPCError } from "@trpc/server";
import { ERROR_DEFINITIONS, isAppError } from "@wadzzo/errors";
import { ZodError } from "zod";

/**
 * Errors leave this API as `{ error: { code, message } }`. Messages from the
 * procedures are written to be shown to users verbatim ("Follow this brand
 * to unlock", "You're 210 m away…"), same as the web shows them.
 */
const STATUS: Record<string, number> = {
  BAD_REQUEST: 400,
  PARSE_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_SUPPORTED: 405,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  TOO_MANY_REQUESTS: 429,
};

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function zodMessage(e: ZodError) {
  const issue = e.issues[0];
  if (!issue) return "Invalid request";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

const fail = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });

/** Turns anything thrown while handling a request into the API's error response. */
export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return fail(e.status, e.code, e.message);
  if (e instanceof ZodError) return fail(400, "BAD_REQUEST", zodMessage(e));
  // Same wire codes as before (tRPC names); the app code decides which one.
  // Server-side failures (5xx) keep the generic body below: their messages are for logs.
  if (isAppError(e) && e.status < 500)
    return fail(e.status, ERROR_DEFINITIONS[e.code].trpc, e.message);
  if (e instanceof TRPCError) {
    const message = e.cause instanceof ZodError ? zodMessage(e.cause) : e.message;
    return fail(STATUS[e.code] ?? 500, e.code, message);
  }
  // Firebase sign-in failures surface as "Firebase: Error (auth/…)." — keep
  // the code so the app can map it to friendly copy, like the old app did.
  const message = e instanceof Error ? e.message : String(e);
  const firebase = /\((auth\/[a-z-]+)\)/.exec(message)?.[1];
  if (firebase) return fail(401, firebase, message);
  console.error("[mobile api]", e);
  return fail(500, "INTERNAL_SERVER_ERROR", "Something went wrong");
}

/** The caller's address from the proxy headers (there's no socket in route handlers). */
export const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  req.headers.get("x-real-ip") ??
  "unknown";

/**
 * Tiny fixed-window limiter. In-memory, so per server instance — a speed bump
 * against scripted abuse of sign-in and collect, not a hard guarantee.
 */
const windows = new Map<string, { start: number; count: number }>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start > windowMs) {
    windows.set(key, { start: now, count: 1 });
    return;
  }
  w.count++;
  if (w.count > max) {
    throw new HttpError(429, "TOO_MANY_REQUESTS", "Too many attempts — try again in a minute.");
  }
}
