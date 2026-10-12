import { describe, expect, it } from "vitest";

import {
  assertSignerBelongsToSession,
  type SigningSessionUser,
} from "../session/assert-signer-belongs-to-session";
import { WalletType } from "../wallet-type";

const custodialUser: SigningSessionUser = {
  email: "Fan@Example.com",
  walletType: WalletType.google,
};
const walletUser: SigningSessionUser = { email: null, walletType: WalletType.freighter };

const notAdmin = () => Promise.resolve(false);
const isAdmin = () => Promise.resolve(true);

const run = (requested: unknown, user = custodialUser, isPlatformAdmin = notAdmin) =>
  assertSignerBelongsToSession({ requested, user, isPlatformAdmin });

describe("assertSignerBelongsToSession", () => {
  it("lets a request without a signer through (the browser signs)", async () => {
    await expect(run(undefined)).resolves.toBeUndefined();
    await expect(run(null, walletUser)).resolves.toBeUndefined();
  });

  it("lets a custodial user sign for their own account, ignoring case", async () => {
    await expect(run({ email: "fan@example.com" })).resolves.toBeUndefined();
  });

  it("refuses another account's email", async () => {
    await expect(run({ email: "victim@example.com" })).rejects.toMatchObject({
      code: "AUTH_FORBIDDEN",
    });
  });

  it("refuses an email from a user who signed in with a real wallet", async () => {
    await expect(run({ email: "fan@example.com" }, walletUser)).rejects.toMatchObject({
      code: "AUTH_FORBIDDEN",
    });
    await expect(
      run(
        { email: "fan@example.com" },
        { email: "fan@example.com", walletType: WalletType.freighter },
      ),
    ).rejects.toMatchObject({ code: "AUTH_FORBIDDEN" });
  });

  it("refuses the platform signer for anyone who isn't an admin", async () => {
    await expect(run({ isAdmin: true })).rejects.toMatchObject({ code: "AUTH_FORBIDDEN" });
  });

  it("lets a platform admin sign as the platform", async () => {
    await expect(run({ isAdmin: true }, walletUser, isAdmin)).resolves.toBeUndefined();
  });

  it("does not look the admin up unless an admin signer is asked for", async () => {
    let lookups = 0;
    const counted = () => {
      lookups += 1;
      return Promise.resolve(false);
    };
    await run({ email: "fan@example.com" }, custodialUser, counted);
    await run({ isAdmin: false }, custodialUser, counted);
    expect(lookups).toBe(0);
  });

  it("judges both keys when a request carries both", async () => {
    await expect(
      run({ email: "fan@example.com", isAdmin: true }, custodialUser, notAdmin),
    ).rejects.toMatchObject({ code: "AUTH_FORBIDDEN" });
  });

  it("refuses shapes that aren't a signer", async () => {
    await expect(run("fan@example.com")).rejects.toMatchObject({ code: "AUTH_FORBIDDEN" });
    await expect(run({ email: ["fan@example.com"] })).rejects.toMatchObject({
      code: "AUTH_FORBIDDEN",
    });
  });
});
