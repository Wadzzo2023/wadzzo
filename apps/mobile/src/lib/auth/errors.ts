import { ApiError } from "~/lib/api/client";

/**
 * Friendly copy for the Firebase auth errors people actually meet, with the
 * old app's WZAR support codes kept so support can still look them up
 * (wadzzoWebAR-public/components/firebase-error.tsx).
 */
const COPY: Record<string, string> = {
  "auth/invalid-email": "That email address doesn't look right. (WZAR030)",
  "auth/invalid-credential": "Email or password is incorrect. (WZAR033)",
  "auth/invalid-login-credentials": "Email or password is incorrect. (WZAR033)",
  "auth/wrong-password": "Email or password is incorrect. (WZAR040)",
  "auth/user-not-found": "Email or password is incorrect. (WZAR088)",
  "auth/email-already-in-use": "An account already uses this email — sign in instead. (WZAR015)",
  "auth/weak-password": "Pick a stronger password — at least 8 characters. (WZAR092)",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again. (WZAR081)",
  "auth/network-request-failed": "Can't reach the sign-in service — check your connection. (WZAR063)",
  "auth/user-disabled": "This account has been disabled. Contact support@wadzzo.com. (WZAR089)",
  "auth/unverified-email": "Verify your email first — we just re-sent the link. (WZAR086)",
  "auth/account-exists-with-different-credential":
    "This email already signs in another way. Use that method instead. (WZAR062)",
};

export const UNVERIFIED = "auth/unverified-email";

export function authErrorCode(e: unknown): string | null {
  if (e instanceof ApiError && e.code.startsWith("auth/")) return e.code;
  const code = (e as { code?: unknown })?.code;
  if (typeof code === "string" && code.startsWith("auth/")) return code;
  const m = /\((auth\/[a-z-]+)\)/.exec(e instanceof Error ? e.message : "");
  return m?.[1] ?? null;
}

export function authErrorMessage(e: unknown): string {
  const code = authErrorCode(e);
  if (code) return COPY[code] ?? `Couldn't sign you in (${code}). Contact support@wadzzo.com if it keeps happening.`;
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong. Please try again.";
}
