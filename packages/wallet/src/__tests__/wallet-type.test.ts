import { describe, expect, it } from "vitest";

import {
  CUSTODIAL_WALLET_TYPES,
  isCustodialWallet,
  isServerSignedWallet,
  WalletType,
} from "../wallet-type";

describe("wallet types", () => {
  it("keeps the stored values stable (sessions and the database hold them)", () => {
    expect(WalletType.freighter).toBe("frieghter");
    expect(WalletType.emailPass).toBe("emailPass");
    expect(WalletType.isAdmin).toBe("isAdmin");
  });

  it("knows which wallets are custodial", () => {
    expect(CUSTODIAL_WALLET_TYPES).toEqual([
      WalletType.emailPass,
      WalletType.google,
      WalletType.facebook,
      WalletType.apple,
    ]);
    expect(isCustodialWallet(WalletType.google)).toBe(true);
    expect(isCustodialWallet(WalletType.albedo)).toBe(false);
    expect(isCustodialWallet(undefined)).toBe(false);
    expect(isCustodialWallet("unknown")).toBe(false);
  });

  it("treats admins as server-signed too", () => {
    expect(isServerSignedWallet(WalletType.isAdmin)).toBe(true);
    expect(isServerSignedWallet(WalletType.apple)).toBe(true);
    expect(isServerSignedWallet(WalletType.xBull)).toBe(false);
  });
});
