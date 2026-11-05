import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyLoginChallenge: vi.fn(),
  verifyFirebaseIdToken: vi.fn(),
  getOrCreateFirebaseUserFromApple: vi.fn(),
  axiosGet: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  branding: { auth: { requireEmailVerification: true } },
  db: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("axios", () => ({ default: { get: mocks.axiosGet } }));
vi.mock("firebase/auth", () => ({
  sendEmailVerification: mocks.sendEmailVerification,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
}));
vi.mock("@wadzzo/platform/branding", () => ({ platformBranding: mocks.branding }));
vi.mock("@albedo-link/signature-verification", () => ({ verifyMessageSignature: () => false }));
vi.mock("@wadzzo/db/server", () => ({ db: mocks.db }));
vi.mock("@wadzzo/platform/server", () => ({
  getCurrentPlatform: () => Promise.resolve({ id: "wadzzo" }),
  getPlatformSlug: () => "wadzzo",
  recordUserPlatform: vi.fn(),
}));
vi.mock("@wadzzo/wallet/firebase", () => ({ firebaseAuth: {} }));
vi.mock("@wadzzo/wallet/server", () => ({
  getOrCreateFirebaseUserFromApple: mocks.getOrCreateFirebaseUserFromApple,
  verifyFirebaseIdToken: mocks.verifyFirebaseIdToken,
  verifyLoginChallenge: mocks.verifyLoginChallenge,
}));

import { authorizeCredentials } from "../authorize-credentials";

const PUBLIC_KEY = "G".padEnd(56, "A");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.branding.auth.requireEmailVerification = true;
  mocks.db.user.findUnique.mockResolvedValue({ id: PUBLIC_KEY, email: "x@x.com" });
  mocks.axiosGet.mockResolvedValue({
    data: { publicKey: PUBLIC_KEY, extra: { isAccActive: true } },
  });
});

describe("authorizeCredentials: email and password", () => {
  const credential = { walletType: "emailPass", email: "x@x.com", password: "password-1" };

  it("turns an unverified account away, and sends the verification email again", async () => {
    mocks.signInWithEmailAndPassword.mockResolvedValue({
      user: { uid: "u1", emailVerified: false },
    });
    const error = await authorizeCredentials(credential).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "WALLET_AUTH_FAILED" });
    expect((error as Error).message).toContain("unverified-email");
    expect(mocks.sendEmailVerification).toHaveBeenCalledTimes(1);
  });

  it("signs a verified account in", async () => {
    mocks.signInWithEmailAndPassword.mockResolvedValue({
      user: { uid: "u1", emailVerified: true },
    });
    await expect(authorizeCredentials(credential)).resolves.toMatchObject({
      emailVerified: true,
    });
    expect(mocks.sendEmailVerification).not.toHaveBeenCalled();
  });

  it("lets an unverified account in, as verified, where the platform doesn't require it", async () => {
    mocks.branding.auth.requireEmailVerification = false;
    mocks.signInWithEmailAndPassword.mockResolvedValue({
      user: { uid: "u1", emailVerified: false },
    });
    await expect(authorizeCredentials(credential)).resolves.toMatchObject({
      id: PUBLIC_KEY,
      emailVerified: true,
    });
    expect(mocks.sendEmailVerification).not.toHaveBeenCalled();
  });
});

describe("authorizeCredentials", () => {
  it("rejects input that isn't a known credential, before touching anything", async () => {
    await expect(authorizeCredentials({})).rejects.toMatchObject({ code: "WALLET_AUTH_FAILED" });
    await expect(authorizeCredentials(undefined)).rejects.toMatchObject({
      code: "WALLET_AUTH_FAILED",
    });
    await expect(
      authorizeCredentials({ walletType: "frieghter", pubkey: PUBLIC_KEY }),
    ).rejects.toMatchObject({ code: "WALLET_AUTH_FAILED" });
    expect(mocks.verifyLoginChallenge).not.toHaveBeenCalled();
  });

  it("signs a wallet in only when the challenge verifies", async () => {
    mocks.verifyLoginChallenge.mockReturnValue(true);
    const user = await authorizeCredentials({
      walletType: "frieghter",
      pubkey: PUBLIC_KEY,
      signedXDR: "AAAA",
    });
    expect(user).toMatchObject({ id: PUBLIC_KEY, walletType: "frieghter" });
    expect(mocks.verifyLoginChallenge).toHaveBeenCalledWith({ publicKey: PUBLIC_KEY, xdr: "AAAA" });

    mocks.verifyLoginChallenge.mockReturnValue(false);
    await expect(
      authorizeCredentials({ walletType: "frieghter", pubkey: PUBLIC_KEY, signedXDR: "AAAA" }),
    ).rejects.toMatchObject({ code: "WALLET_AUTH_FAILED" });
  });

  it("gives the Apple account the email Apple vouched for, not the one the client sent", async () => {
    mocks.getOrCreateFirebaseUserFromApple.mockResolvedValue({
      uid: "apple-owner",
      email: "owner@x.com",
    });

    const user = await authorizeCredentials({
      walletType: "apple",
      appleToken: "apple-token",
      email: "victim@x.com",
    });

    expect(mocks.getOrCreateFirebaseUserFromApple).toHaveBeenCalledWith("apple-token");
    expect(mocks.axiosGet.mock.calls[0]?.[1]).toMatchObject({
      params: { uid: "apple-owner", email: "owner@x.com" },
    });
    expect(user).toMatchObject({ email: "owner@x.com", walletType: "apple" });
  });

  it("returns null for an Apple credential with no token at all", async () => {
    await expect(
      authorizeCredentials({ walletType: "apple", email: "a@x.com" }),
    ).resolves.toBeNull();
  });
});
