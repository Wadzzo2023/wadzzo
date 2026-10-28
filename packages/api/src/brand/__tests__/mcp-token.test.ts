import { describe, expect, it, vi } from "vitest";

import type { Db, Platform } from "@wadzzo/db";

import {
  bearerMcpToken,
  generateMcpToken,
  hashMcpToken,
  MCP_TOKEN_PREFIX,
  mcpSession,
} from "../mcp/token";

const WADZZO = { id: "wadzzo", name: "Wadzzo", isRoot: true } as Platform;
const CLINTON = { id: "clintoncounty", name: "Clinton County", isRoot: false } as Platform;

const { token, tokenHash } = generateMcpToken();

/** A stand-in database holding one token row. */
function dbWith(
  row: Partial<{ platformId: string; revokedAt: Date | null; lastUsedAt: Date | null }>,
) {
  const stored = {
    id: "tok_1",
    platformId: "wadzzo",
    walletType: "emailPass",
    revokedAt: null,
    lastUsedAt: null,
    user: { id: "BRAND", name: "Brand", email: "b@x.io", image: null, emailVerified: new Date() },
    ...row,
  };
  const update = vi.fn(async () => stored);
  const db = {
    mcpToken: {
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
        where.tokenHash === tokenHash ? stored : null,
      ),
      update,
    },
  } as unknown as Db;
  return { db, update };
}

describe("MCP tokens", () => {
  it("are random, prefixed, and stored only as a hash", () => {
    const a = generateMcpToken();
    const b = generateMcpToken();
    expect(a.token.startsWith(MCP_TOKEN_PREFIX)).toBe(true);
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).toBe(hashMcpToken(a.token));
    expect(a.tokenHash).not.toContain(a.token.slice(MCP_TOKEN_PREFIX.length));
    expect(a.token.startsWith(a.prefix)).toBe(true);
    expect(a.prefix.length).toBeLessThan(a.token.length / 2);
  });

  it("are read from a Bearer header, and only if they look like ours", () => {
    expect(bearerMcpToken(`Bearer ${token}`)).toBe(token);
    expect(bearerMcpToken(`bearer ${token}`)).toBe(token);
    expect(bearerMcpToken("Bearer some-other-jwt")).toBeNull();
    expect(bearerMcpToken(token)).toBeNull();
    expect(bearerMcpToken(null)).toBeNull();
  });

  it("give the token's person a session on its own platform", async () => {
    const { db } = dbWith({});
    const session = await mcpSession(db, WADZZO, token);
    expect(session?.user).toMatchObject({
      id: "BRAND",
      walletType: "emailPass",
      emailVerified: true,
    });
  });

  it("don't work when unknown, revoked, or on another platform", async () => {
    expect(await mcpSession(dbWith({}).db, WADZZO, generateMcpToken().token)).toBeNull();
    expect(await mcpSession(dbWith({ revokedAt: new Date() }).db, WADZZO, token)).toBeNull();
    expect(await mcpSession(dbWith({}).db, CLINTON, token)).toBeNull();
  });

  it("note when they were last used, but not on every request", async () => {
    const fresh = dbWith({ lastUsedAt: new Date() });
    await mcpSession(fresh.db, WADZZO, token);
    expect(fresh.update).not.toHaveBeenCalled();

    const stale = dbWith({ lastUsedAt: new Date(Date.now() - 60 * 60_000) });
    await mcpSession(stale.db, WADZZO, token);
    expect(stale.update).toHaveBeenCalledOnce();
  });
});
