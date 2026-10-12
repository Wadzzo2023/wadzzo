import jwt from "jsonwebtoken";

import { env } from "~/env";
import type { AuthUser } from "~/server/auth/credentials";
import { AppError, ErrorCodes } from "@wadzzo/errors";

/**
 * ── Mobile session tokens ──────────────────────────────────────────────────
 *
 * A signed JWT the app sends as `Authorization: Bearer …`.
 *
 * Decided 2026-09-26: tokens **never expire and are not revocable** server-
 * side (the risk that a leaked token works indefinitely was accepted). The
 * only guard is in `context.ts`, which rejects a token whose user no longer
 * exists — so deleting an account does cut access. Rotating
 * `MOBILE_JWT_SECRET` invalidates every token at once.
 */

export type MobileTokenClaims = {
  sub: string;
  walletType: AuthUser["walletType"];
  emailVerified: boolean;
  email?: string | null;
  /** Token format version, so a future format can reject old ones. */
  v: 1;
};

function secret() {
  const s = env.MOBILE_JWT_SECRET ?? env.NEXTAUTH_SECRET;
  if (!s)
    throw new AppError(ErrorCodes.CONFIG_MISSING, {
      message: "MOBILE_JWT_SECRET (or NEXTAUTH_SECRET) is not set",
    });
  return s;
}

export function signMobileToken(user: AuthUser): string {
  const claims: MobileTokenClaims = {
    sub: user.id,
    walletType: user.walletType,
    emailVerified: user.emailVerified,
    email: user.email ?? null,
    v: 1,
  };
  return jwt.sign(claims, secret(), { algorithm: "HS256", noTimestamp: false });
}

export function verifyMobileToken(token: string): MobileTokenClaims | null {
  try {
    const claims = jwt.verify(token, secret(), { algorithms: ["HS256"] });
    if (typeof claims !== "object" || claims.v !== 1 || !claims.sub) return null;
    return claims as MobileTokenClaims;
  } catch {
    return null;
  }
}
