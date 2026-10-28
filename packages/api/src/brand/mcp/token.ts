import { createHash, randomBytes } from "crypto";
import type { Session } from "next-auth";

import type { Db, Platform } from "@wadzzo/db";
import type { WalletType } from "@wadzzo/wallet/shared";

/**
 * ── MCP access tokens ───────────────────────────────────────────────────────
 *
 * A person creates a token in Settings → AI connections and pastes it into an
 * AI app as `Authorization: Bearer wz_mcp_…`. Only its SHA-256 is stored, so a
 * database leak doesn't leak working tokens. A token works on the platform it
 * was made on, until it's revoked or the user is deleted.
 */

export const MCP_TOKEN_PREFIX = "wz_mcp_";
/** Characters kept in `prefix`, so the settings list can tell tokens apart. */
const SHOWN_CHARS = MCP_TOKEN_PREFIX.length + 6;
/** `lastUsedAt` is written at most this often, not on every request. */
const LAST_USED_GRANULARITY_MS = 5 * 60_000;

export function hashMcpToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** A new token (shown once) and what's stored about it. */
export function generateMcpToken() {
  const token = MCP_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, tokenHash: hashMcpToken(token), prefix: token.slice(0, SHOWN_CHARS) };
}

/** The token from an `Authorization: Bearer …` header, if it looks like one of ours. */
export function bearerMcpToken(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  const token = match?.[1];
  return token?.startsWith(MCP_TOKEN_PREFIX) ? token : null;
}

/**
 * The session a token stands for on this platform, or null (unknown, revoked,
 * another platform's, or its user is gone). Procedures then check brand access
 * exactly as they do for a signed-in person.
 */
export async function mcpSession(
  db: Db,
  platform: Platform,
  token: string,
): Promise<Session | null> {
  const row = await db.mcpToken.findUnique({
    where: { tokenHash: hashMcpToken(token) },
    select: {
      id: true,
      platformId: true,
      walletType: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { id: true, name: true, email: true, image: true, emailVerified: true } },
    },
  });
  if (!row || row.revokedAt || row.platformId !== platform.id) return null;

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_GRANULARITY_MS) {
    await db.mcpToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  }

  const { user } = row;
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      walletType: row.walletType as WalletType,
      emailVerified: Boolean(user.emailVerified),
    },
    // Not an expiry anyone obeys — NextAuth's Session type just requires it.
    expires: "9999-12-31T23:59:59.000Z",
  };
}
