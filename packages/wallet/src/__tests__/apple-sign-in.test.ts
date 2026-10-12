import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getUserByProviderUid: vi.fn(),
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
}));
const verifyAppleToken = vi.hoisted(() => vi.fn());

vi.mock("firebase-admin/auth", () => ({ getAuth: () => auth }));
vi.mock("../firebase/admin-app", () => ({ initFirebaseAdmin: () => ({}) }));
vi.mock("../firebase/verify-apple-token", () => ({ verifyAppleToken }));

import { getOrCreateFirebaseUserFromApple } from "../firebase/admin-users";

const notFound = Object.assign(new Error("not found"), { code: "auth/user-not-found" });
const link = (uid: string, email: string) => ({
  providerToLink: { uid, providerId: "apple.com", email },
});

beforeEach(() => {
  vi.resetAllMocks();
  auth.updateUser.mockImplementation((uid: string) => Promise.resolve({ uid }));
});

describe("getOrCreateFirebaseUserFromApple", () => {
  it("returns the user already linked to the Apple account", async () => {
    verifyAppleToken.mockResolvedValue({ sub: "apple-1", email: "a@x.com", emailVerified: true });
    auth.getUserByProviderUid.mockResolvedValue({ uid: "linked" });

    await expect(getOrCreateFirebaseUserFromApple("token")).resolves.toEqual({ uid: "linked" });
    expect(auth.getUserByProviderUid).toHaveBeenCalledWith("apple.com", "apple-1");
    expect(auth.getUserByEmail).not.toHaveBeenCalled();
  });

  it("never looks up an account by an email Apple didn't vouch for", async () => {
    verifyAppleToken.mockResolvedValue({ sub: "apple-2", email: undefined, emailVerified: false });
    auth.getUserByProviderUid.mockRejectedValue(notFound);

    await expect(getOrCreateFirebaseUserFromApple("token")).rejects.toMatchObject({
      code: "WALLET_AUTH_FAILED",
    });
    expect(auth.getUserByEmail).not.toHaveBeenCalled();
    expect(auth.createUser).not.toHaveBeenCalled();
  });

  it("refuses an unverified email", async () => {
    verifyAppleToken.mockResolvedValue({ sub: "apple-3", email: "a@x.com", emailVerified: false });
    auth.getUserByProviderUid.mockRejectedValue(notFound);

    await expect(getOrCreateFirebaseUserFromApple("token")).rejects.toMatchObject({
      code: "WALLET_AUTH_FAILED",
    });
  });

  it("links the Apple account to the user with the verified email on first sign-in", async () => {
    verifyAppleToken.mockResolvedValue({ sub: "apple-4", email: "a@x.com", emailVerified: true });
    auth.getUserByProviderUid.mockRejectedValue(notFound);
    auth.getUserByEmail.mockResolvedValue({ uid: "by-email" });

    await expect(getOrCreateFirebaseUserFromApple("token")).resolves.toEqual({ uid: "by-email" });
    expect(auth.getUserByEmail).toHaveBeenCalledWith("a@x.com");
    expect(auth.updateUser).toHaveBeenCalledWith("by-email", link("apple-4", "a@x.com"));
  });

  it("creates and links a user when there is none", async () => {
    verifyAppleToken.mockResolvedValue({ sub: "apple-5", email: "new@x.com", emailVerified: true });
    auth.getUserByProviderUid.mockRejectedValue(notFound);
    auth.getUserByEmail.mockRejectedValue(notFound);
    auth.createUser.mockResolvedValue({ uid: "created" });

    await expect(getOrCreateFirebaseUserFromApple("token")).resolves.toEqual({ uid: "created" });
    expect(auth.createUser).toHaveBeenCalledWith({ email: "new@x.com", emailVerified: true });
    expect(auth.updateUser).toHaveBeenCalledWith("created", link("apple-5", "new@x.com"));
  });

  it("does not hide unexpected Firebase failures", async () => {
    verifyAppleToken.mockResolvedValue({ sub: "apple-6", email: "a@x.com", emailVerified: true });
    auth.getUserByProviderUid.mockRejectedValue(
      Object.assign(new Error("quota"), { code: "auth/quota-exceeded" }),
    );

    await expect(getOrCreateFirebaseUserFromApple("token")).rejects.toThrow("quota");
  });
});
