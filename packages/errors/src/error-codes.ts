/**
 * Every error the platform can raise on purpose has one code here.
 *
 * - `status`  the HTTP status when it leaves an API route
 * - `trpc`    the tRPC code it maps to (so existing clients keep working)
 * - `message` a safe, user-facing default; callers may pass a more specific one
 *
 * Codes are `DOMAIN_REASON`, SCREAMING_SNAKE_CASE, and never change once shipped:
 * clients branch on them.
 */
export type TrpcErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "TOO_MANY_REQUESTS"
  | "PAYMENT_REQUIRED"
  | "INTERNAL_SERVER_ERROR"
  | "BAD_GATEWAY"
  | "SERVICE_UNAVAILABLE";

export interface ErrorDefinition {
  readonly status: number;
  readonly trpc: TrpcErrorCode;
  readonly message: string;
}

const define = <const T extends Record<string, ErrorDefinition>>(definitions: T) => definitions;

export const ERROR_DEFINITIONS = define({
  // ── sign-in and access ───────────────────────────────────────────────────
  AUTH_REQUIRED: { status: 401, trpc: "UNAUTHORIZED", message: "Please sign in to continue." },
  AUTH_SESSION_EXPIRED: {
    status: 401,
    trpc: "UNAUTHORIZED",
    message: "Your session has expired. Please sign in again.",
  },
  AUTH_FORBIDDEN: {
    status: 403,
    trpc: "FORBIDDEN",
    message: "You don't have permission to do that.",
  },
  AUTH_ADMIN_ONLY: { status: 403, trpc: "FORBIDDEN", message: "This area is for admins only." },
  AUTH_NOT_A_CREATOR: {
    status: 403,
    trpc: "FORBIDDEN",
    message: "Create a brand profile before using this.",
  },

  // ── white-label platforms ────────────────────────────────────────────────
  PLATFORM_NOT_FOUND: {
    status: 500,
    trpc: "INTERNAL_SERVER_ERROR",
    message: "This platform is not set up yet.",
  },
  PLATFORM_FORBIDDEN: {
    status: 403,
    trpc: "FORBIDDEN",
    message: "This belongs to a different platform.",
  },

  // ── generic request problems ─────────────────────────────────────────────
  VALIDATION_FAILED: {
    status: 400,
    trpc: "BAD_REQUEST",
    message: "Some of the details are invalid.",
  },
  RESOURCE_NOT_FOUND: { status: 404, trpc: "NOT_FOUND", message: "We couldn't find that." },
  RESOURCE_CONFLICT: {
    status: 409,
    trpc: "CONFLICT",
    message: "That was changed by someone else. Refresh and try again.",
  },
  PRECONDITION_NOT_MET: {
    status: 412,
    trpc: "PRECONDITION_FAILED",
    message: "That can't be done right now.",
  },
  ITEM_NOT_AVAILABLE: {
    status: 412,
    trpc: "PRECONDITION_FAILED",
    message: "This item isn't available right now.",
  },
  WALLET_NEEDS_SETUP: {
    status: 412,
    trpc: "PRECONDITION_FAILED",
    message: "Your wallet needs a little setup first (a trustline or some XLM).",
  },
  STORAGE_ACCOUNT_UNAVAILABLE: {
    status: 412,
    trpc: "PRECONDITION_FAILED",
    message: "The storage account isn't available.",
  },
  RATE_LIMITED: {
    status: 429,
    trpc: "TOO_MANY_REQUESTS",
    message: "Too many attempts. Try again in a minute.",
  },

  // ── wallets (connect, sign in, sign) ─────────────────────────────────────
  WALLET_NOT_CONNECTED: {
    status: 401,
    trpc: "UNAUTHORIZED",
    message: "Connect a wallet to continue.",
  },
  WALLET_PROVIDER_UNAVAILABLE: {
    status: 400,
    trpc: "BAD_REQUEST",
    message: "That wallet isn't available in this browser.",
  },
  WALLET_CONNECTION_REJECTED: {
    status: 400,
    trpc: "BAD_REQUEST",
    message: "The wallet connection was cancelled.",
  },
  WALLET_SIGNING_REJECTED: {
    status: 400,
    trpc: "BAD_REQUEST",
    message: "The signature request was cancelled.",
  },
  WALLET_SIGNING_FAILED: {
    status: 400,
    trpc: "BAD_REQUEST",
    message: "The wallet couldn't sign the transaction.",
  },
  WALLET_AUTH_FAILED: { status: 401, trpc: "UNAUTHORIZED", message: "Sign-in failed. Try again." },
  WALLET_UNSUPPORTED_ACTION: {
    status: 400,
    trpc: "BAD_REQUEST",
    message: "This wallet can't do that.",
  },
  WALLET_NETWORK_MISMATCH: {
    status: 400,
    trpc: "BAD_REQUEST",
    message: "Your wallet is on a different Stellar network than this app.",
  },

  // ── Stellar network ──────────────────────────────────────────────────────
  STELLAR_ACCOUNT_NOT_FOUND: {
    status: 404,
    trpc: "NOT_FOUND",
    message: "That Stellar account doesn't exist yet.",
  },
  STELLAR_INSUFFICIENT_BALANCE: {
    status: 400,
    trpc: "BAD_REQUEST",
    message: "There isn't enough balance for that.",
  },
  STELLAR_TRUSTLINE_MISSING: {
    status: 400,
    trpc: "BAD_REQUEST",
    message: "The account needs a trustline for this asset first.",
  },
  STELLAR_TX_BUILD_FAILED: {
    status: 500,
    trpc: "INTERNAL_SERVER_ERROR",
    message: "We couldn't prepare that transaction.",
  },
  STELLAR_TX_REJECTED: {
    status: 400,
    trpc: "BAD_REQUEST",
    message: "The Stellar network rejected that transaction.",
  },
  STELLAR_TX_SUBMIT_FAILED: {
    status: 502,
    trpc: "BAD_GATEWAY",
    message: "We couldn't submit the transaction. Try again.",
  },
  STELLAR_QUOTE_EXPIRED: {
    status: 409,
    trpc: "CONFLICT",
    message: "That quote has expired. Review the new price and try again.",
  },
  STELLAR_NETWORK_UNAVAILABLE: {
    status: 503,
    trpc: "SERVICE_UNAVAILABLE",
    message: "The Stellar network isn't reachable right now.",
  },

  // ── payments, storage, setup ─────────────────────────────────────────────
  PAYMENT_FAILED: {
    status: 402,
    trpc: "PAYMENT_REQUIRED",
    message: "The payment didn't go through.",
  },
  UPLOAD_FAILED: {
    status: 502,
    trpc: "BAD_GATEWAY",
    message: "The upload failed. Try again.",
  },
  EXTERNAL_SERVICE_FAILED: {
    status: 502,
    trpc: "BAD_GATEWAY",
    message: "A service we depend on isn't responding.",
  },
  AI_GENERATION_FAILED: {
    status: 500,
    trpc: "INTERNAL_SERVER_ERROR",
    message: "The AI couldn't produce a result. Try again.",
  },
  CONFIG_MISSING: {
    status: 500,
    trpc: "INTERNAL_SERVER_ERROR",
    message: "The server is missing a required setting.",
  },
  INTERNAL: { status: 500, trpc: "INTERNAL_SERVER_ERROR", message: "Something went wrong." },
} satisfies Record<string, ErrorDefinition>);

export type ErrorCode = keyof typeof ERROR_DEFINITIONS;

/** All codes as a typed object, so call sites read `ErrorCodes.WALLET_NOT_CONNECTED`. */
export const ErrorCodes = Object.fromEntries(
  Object.keys(ERROR_DEFINITIONS).map((code) => [code, code]),
) as { readonly [C in ErrorCode]: C };

export const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === "string" && value in ERROR_DEFINITIONS;
