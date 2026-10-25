import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const SESSION = "__Secure-next-auth.session-token";

/** The module reads AUTH_COOKIE_DOMAIN once at import, so each case loads a fresh copy. */
async function load(domain?: string) {
  vi.resetModules();
  vi.unstubAllEnvs();
  if (domain) vi.stubEnv("AUTH_COOKIE_DOMAIN", domain);
  return import("../session-cookie");
}

function request(cookie?: string) {
  return new NextRequest("https://app.wadzzo.com/", cookie ? { headers: { cookie } } : undefined);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sharedSessionCookie", () => {
  it("leaves NextAuth's defaults alone when no domain is set", async () => {
    const { sharedSessionCookie } = await load();
    expect(sharedSessionCookie).toBeUndefined();
  });

  it("writes the session cookie for the whole domain, keeping the default name", async () => {
    const { sharedSessionCookie } = await load(".wadzzo.com");
    expect(sharedSessionCookie?.sessionToken.name).toBe(SESSION);
    expect(sharedSessionCookie?.sessionToken.options).toMatchObject({
      domain: ".wadzzo.com",
      secure: true,
      httpOnly: true,
    });
  });
});

describe("clearLegacySessionCookie", () => {
  it("expires the host-only copy (no Domain) when the request carries a session", async () => {
    const { clearLegacySessionCookie } = await load(".wadzzo.com");
    const res = NextResponse.next();
    clearLegacySessionCookie(request(`${SESSION}=abc; other=1`), res);
    const cleared = res.headers.get("set-cookie") ?? "";
    expect(cleared).toContain(`${SESSION}=; Path=/; Max-Age=0`);
    expect(cleared).not.toMatch(/domain=/i);
  });

  it("also expires chunked session cookies", async () => {
    const { clearLegacySessionCookie } = await load(".wadzzo.com");
    const res = NextResponse.next();
    clearLegacySessionCookie(request(`${SESSION}.0=a; ${SESSION}.1=b`), res);
    const cleared = res.headers.get("set-cookie") ?? "";
    expect(cleared).toContain(`${SESSION}.0=;`);
    expect(cleared).toContain(`${SESSION}.1=;`);
  });

  it("does nothing without a session cookie or without a shared domain", async () => {
    const shared = await load(".wadzzo.com");
    const res = NextResponse.next();
    shared.clearLegacySessionCookie(request("other=1"), res);
    expect(res.headers.get("set-cookie")).toBeNull();

    const local = await load();
    const res2 = NextResponse.next();
    local.clearLegacySessionCookie(request(`${SESSION}=abc`), res2);
    expect(res2.headers.get("set-cookie")).toBeNull();
  });
});
