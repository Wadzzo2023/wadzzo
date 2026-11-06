import { afterEach, describe, expect, it, vi } from "vitest";

import { taskServerUrl } from "../lib/express/server-url";

afterEach(() => vi.unstubAllEnvs());

const set = (vars: Record<string, string>) => {
  for (const name of ["EXPRESS_SERVER_URL", "VERCEL_ENV", "NODE_ENV"]) vi.stubEnv(name, "");
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
};

describe("taskServerUrl", () => {
  it("uses EXPRESS_SERVER_URL when set, without a trailing slash", () => {
    set({ EXPRESS_SERVER_URL: "https://tasks.example.com/api/", VERCEL_ENV: "production" });
    expect(taskServerUrl()).toBe("https://tasks.example.com/api");
  });

  it("falls back to the live server on the production deployment only", () => {
    set({ VERCEL_ENV: "production", NODE_ENV: "production" });
    expect(taskServerUrl()).toBe("https://wadzzo.54-69-28-110.sslip.io");
    set({ NODE_ENV: "production" }); // self-hosted production
    expect(taskServerUrl()).toBe("https://wadzzo.54-69-28-110.sslip.io");
  });

  it("never falls back to production from a preview or the dev domain", () => {
    // Vercel builds previews with NODE_ENV=production too
    set({ VERCEL_ENV: "preview", NODE_ENV: "production" });
    expect(() => taskServerUrl()).toThrowError(
      expect.objectContaining({ code: "EXTERNAL_SERVICE_FAILED" }),
    );
    set({ VERCEL_ENV: "development", NODE_ENV: "production" });
    expect(() => taskServerUrl()).toThrowError(/EXPRESS_SERVER_URL/);
  });

  it("is not configured outside production", () => {
    set({ NODE_ENV: "development" });
    expect(() => taskServerUrl()).toThrowError(/EXPRESS_SERVER_URL/);
  });
});
