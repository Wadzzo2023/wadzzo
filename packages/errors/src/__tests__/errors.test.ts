import { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AppError,
  ERROR_DEFINITIONS,
  ErrorCodes,
  isAppError,
  isErrorCode,
  isProductionDeployment,
  requireEnv,
  toAppError,
} from "../index";
import { appErrorMiddleware, isKnownError, toTRPCError, withAppCode } from "../trpc";

describe("error codes", () => {
  it("has a status, tRPC code and message for every code", () => {
    for (const [code, definition] of Object.entries(ERROR_DEFINITIONS)) {
      expect(definition.status, code).toBeGreaterThanOrEqual(400);
      expect(definition.message, code).not.toBe("");
      expect(ErrorCodes[code as keyof typeof ErrorCodes], code).toBe(code);
      expect(isErrorCode(code)).toBe(true);
    }
    expect(isErrorCode("NOT_A_CODE")).toBe(false);
  });

  it("maps sign-in and access codes to the right HTTP and tRPC status", () => {
    expect(ERROR_DEFINITIONS.AUTH_REQUIRED).toMatchObject({ status: 401, trpc: "UNAUTHORIZED" });
    expect(ERROR_DEFINITIONS.AUTH_FORBIDDEN).toMatchObject({ status: 403, trpc: "FORBIDDEN" });
    expect(ERROR_DEFINITIONS.RESOURCE_NOT_FOUND).toMatchObject({ status: 404, trpc: "NOT_FOUND" });
  });
});

describe("AppError", () => {
  it("defaults to the code's message and keeps cause and details", () => {
    const cause = new Error("boom");
    const error = new AppError(ErrorCodes.AUTH_REQUIRED, { cause, details: { a: 1 } });
    expect(error.message).toBe("Please sign in to continue.");
    expect(error.status).toBe(401);
    expect(error.cause).toBe(cause);
    expect(error.details).toEqual({ a: 1 });
    expect(error.toJSON()).toEqual({
      error: { code: "AUTH_REQUIRED", message: "Please sign in to continue." },
    });
  });

  it("is recognised by shape too (another bundle's copy of the class)", () => {
    const foreign = Object.assign(new Error("x"), { name: "AppError", code: "AUTH_REQUIRED" });
    expect(isAppError(foreign)).toBe(true);
    expect(isAppError(new Error("x"))).toBe(false);
  });

  it("wraps unknown errors as INTERNAL and leaves app errors alone", () => {
    const known = new AppError(ErrorCodes.RESOURCE_NOT_FOUND);
    expect(toAppError(known)).toBe(known);
    expect(toAppError(new Error("db down"))).toMatchObject({ code: "INTERNAL" });
  });

  it("requireEnv names the missing variable", () => {
    expect(requireEnv("X", "value")).toBe("value");
    expect(() => requireEnv("MY_VAR", undefined)).toThrowError(/MY_VAR/);
    expect(() => requireEnv("MY_VAR", "")).toThrowError(
      expect.objectContaining({ code: "CONFIG_MISSING" }),
    );
  });
});

describe("tRPC mapping", () => {
  it("turns an app error into the tRPC error its code maps to, keeping it as cause", () => {
    const appError = new AppError(ErrorCodes.AUTH_FORBIDDEN);
    const trpcError = toTRPCError(appError);
    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.code).toBe("FORBIDDEN");
    expect(trpcError.cause).toBe(appError);
    expect(toTRPCError(new Error("bug")).code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("separates errors we raised from bugs", () => {
    expect(isKnownError(new AppError(ErrorCodes.AUTH_REQUIRED))).toBe(true);
    expect(isKnownError(new TRPCError({ code: "BAD_REQUEST" }))).toBe(true);
    expect(isKnownError(new Error("bug"))).toBe(false);
  });

  it("adds the app code to error responses", () => {
    const shape = { message: "m", data: { code: "FORBIDDEN" } };
    const cause = new AppError(ErrorCodes.AUTH_FORBIDDEN);
    expect(withAppCode(shape, { cause }).data).toEqual({
      code: "FORBIDDEN",
      appCode: "AUTH_FORBIDDEN",
    });
    expect(withAppCode(shape, { cause: new Error("x") }).data.appCode).toBeNull();
  });

  it("middleware rethrows an app error below it as the matching tRPC error", async () => {
    const appError = new AppError(ErrorCodes.RESOURCE_NOT_FOUND);
    await expect(
      appErrorMiddleware({
        next: () => Promise.resolve({ ok: false, error: { cause: appError } }),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const fine = { ok: true as const };
    await expect(appErrorMiddleware({ next: () => Promise.resolve(fine) })).resolves.toBe(fine);
  });
});

describe("isProductionDeployment", () => {
  afterEach(() => vi.unstubAllEnvs());

  const where = (vars: { VERCEL_ENV?: string; NODE_ENV?: string }) => {
    vi.stubEnv("VERCEL_ENV", vars.VERCEL_ENV ?? "");
    vi.stubEnv("NODE_ENV", vars.NODE_ENV ?? "");
    return isProductionDeployment();
  };

  it("lets VERCEL_ENV decide on Vercel, where every deployment is NODE_ENV=production", () => {
    expect(where({ VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(true);
    expect(where({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(false);
    expect(where({ VERCEL_ENV: "development", NODE_ENV: "production" })).toBe(false);
  });

  it("uses NODE_ENV when not on Vercel", () => {
    expect(where({ NODE_ENV: "production" })).toBe(true);
    expect(where({ NODE_ENV: "development" })).toBe(false);
    expect(where({})).toBe(false);
  });
});
