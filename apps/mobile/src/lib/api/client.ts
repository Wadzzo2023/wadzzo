import Constants from "expo-constants";

/**
 * ── API client ─────────────────────────────────────────────────────────────
 *
 * Talks to wadzzoAR's `/api/mobile/v1` (contract: docs/02-api.md). Adds the
 * Bearer token, and turns error bodies (`{ error: { code, message } }`) into
 * `ApiError`s whose `message` is written to be shown to users as-is — the
 * same verbatim-server-message rule the web follows.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * `.env` keeps `http://localhost:3000` for development (decided). On a real
 * phone `localhost` is the phone itself, so in dev builds the host is swapped
 * for the Mac's LAN IP — the same address the phone already reaches Metro on
 * (`hostUri`). Production builds use the URL exactly as configured.
 */
function resolveBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
  if (!__DEV__) return configured;
  const hostUri = Constants.expoConfig?.hostUri; // e.g. "192.168.1.20:8081"
  const lanHost = hostUri?.split(":")[0];
  if (!lanHost) return configured;
  return configured.replace(/\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/, `//${lanHost}`);
}

/** wadzzoAR itself — also serves the Albedo bridge page at `/albedo`. */
export const SERVER_URL = resolveBaseUrl().replace(/\/$/, "");
export const API_BASE = `${SERVER_URL}/api/mobile/v1`;

let tokenGetter: () => string | null = () => null;
let onUnauthorized: () => void = () => undefined;

/** Wired once by the session store, so this module has no import cycle. */
export function configureApi(opts: { getToken: () => string | null; onUnauthorized: () => void }) {
  tokenGetter = opts.getToken;
  onUnauthorized = opts.onUnauthorized;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function withQuery(path: string, query?: Query) {
  if (!query) return path;
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return qs ? `${path}?${qs}` : path;
}

export async function api<T>(
  path: string,
  opts: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; query?: Query; signal?: AbortSignal } = {},
): Promise<T> {
  const token = tokenGetter();
  let res: Response;
  try {
    res = await fetch(API_BASE + withQuery(path, opts.query), {
      method: opts.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    // A cancelled request (React Query dropped it for a newer one) is not a
    // network failure — rethrow it untouched so it's never shown as one.
    if (opts.signal?.aborted) throw err;
    throw new ApiError(0, "NETWORK", "Can't reach Wadzzo — check your connection.");
  }

  const data = (await res.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;

  if (!res.ok) {
    // A token the server no longer accepts (account deleted) signs the
    // viewer out quietly; the screen falls back to its signed-out state.
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(
      res.status,
      data?.error?.code ?? "HTTP_" + res.status,
      data?.error?.message ?? "Something went wrong",
    );
  }
  return data as T;
}
