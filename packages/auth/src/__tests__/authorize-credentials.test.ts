import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyLoginChallenge: vi.fn(),
  verifyFirebaseIdToken: vi.fn(),
  getOrCreateFirebaseUserFromApple: vi.fn(),
  axiosGet: vi.fn(),
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
  sendEmailVerification: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
}));
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
  mocks.db.user.findUnique.mockResolvedValue({ id: PUBLIC_KEY, email: "x@x.com" });
  mocks.axiosGet.mockResolvedValue({
    data: { publicKey: PUBLIC_KEY, extra: { isAccActive: true } },
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
