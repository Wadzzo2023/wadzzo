import { Horizon, NotFoundError } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StellarAccount } from "../account";

const ISSUER = "GAPWBIC6RVQZCLBQ4GTZSI3I7YRYTSBC7EJ65KHHPL4T5CJECU3PQ7PD";

function accountWith(overrides: Record<string, unknown> = {}) {
  vi.spyOn(Horizon.Server.prototype, "loadAccount").mockResolvedValue({
    subentry_count: 2,
    balances: [
      { asset_type: "native", balance: "100.0000000", selling_liabilities: "5.0000000" },
      {
        asset_type: "credit_alphanum12",
        asset_code: "TESTTOKEN",
        asset_issuer: ISSUER,
        balance: "40.0000000",
        limit: "100.0000000",
        buying_liabilities: "10.0000000",
      },
    ],
    ...overrides,
  } as never);
  return StellarAccount.load("GACCOUNT");
}

afterEach(() => vi.restoreAllMocks());

describe("StellarAccount", () => {
  it("reads asset holdings and trustlines", async () => {
    const account = (await accountWith())!;
    expect(account.hasTrustline("TESTTOKEN", ISSUER)).toBe(true);
    expect(account.hasTrustline("OTHER", ISSUER)).toBe(false);
    expect(account.tokenBalance("TESTTOKEN", ISSUER)).toBe(40);
    expect(account.tokenBalance("OTHER", ISSUER)).toBe(0);
    expect(account.tokenRoom("TESTTOKEN", ISSUER)).toBe(50);
    expect(account.platformBalance()).toBe(40);
    expect(account.trustsPlatformAsset()).toBe(true);
  });

  it("works out spendable XLM after reserves and open sell offers", async () => {
    // reserve: (2 base + 2 subentries) × 0.5 = 2 XLM; selling 5 → 100 − 2 − 5
    const account = (await accountWith())!;
    expect(account.minimumBalance()).toBe(2);
    expect(account.spendableXlm()).toBe(93);
  });

  it("counts sponsorship in the reserve", async () => {
    const account = (await accountWith({ num_sponsoring: 2, num_sponsored: 1 }))!;
    expect(account.minimumBalance()).toBe(2.5);
  });

  it("never reports negative spendable XLM", async () => {
    const account = (await accountWith({
      balances: [{ asset_type: "native", balance: "1.0000000", selling_liabilities: "0" }],
    }))!;
    expect(account.spendableXlm()).toBe(0);
  });

  it("is null for an unfunded account and throws a coded error on demand", async () => {
    vi.spyOn(Horizon.Server.prototype, "loadAccount").mockRejectedValue(
      new NotFoundError("not found", {}),
    );
    await expect(StellarAccount.load("GNEW")).resolves.toBeNull();
    await expect(StellarAccount.loadOrThrow("GNEW")).rejects.toMatchObject({
      code: "STELLAR_ACCOUNT_NOT_FOUND",
    });
  });

  it("checks the subentry limit", async () => {
    const account = (await accountWith({ subentry_count: 999 }))!;
    expect(account.canAddSubentries(1)).toBe(true);
    expect(account.canAddSubentries(2)).toBe(false);
  });
});
