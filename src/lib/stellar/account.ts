import { Horizon } from "@stellar/stellar-sdk";

import { STELLAR_URL } from "./constant";

/**
 * ── Stellar account balances ───────────────────────────────────────────────
 *
 * Ported from the main webapp's `lib/stellar/marketplace/test/Account.ts`,
 * trimmed to the two things the AR app needs: is this wallet holding enough of
 * a creator's page asset to clear a tier, and does it trust that asset at all.
 *
 * Tier eligibility is deliberately read live from Horizon rather than from
 * anything in Postgres — there is no balance column on `User`, and a holding
 * can change without this app ever seeing the transaction.
 */

type Balances = Awaited<
  ReturnType<Horizon.Server["loadAccount"]>
>["balances"];

export class StellarAccount {
  private balances: Balances;

  private constructor(balances: Balances) {
    this.balances = balances;
  }

  static async create(pubkey: string) {
    const server = new Horizon.Server(STELLAR_URL);
    const account = await server.loadAccount(pubkey);
    return new StellarAccount(account.balances);
  }

  /**
   * Never throws for an unfunded or unknown account — a wallet that Horizon
   * has never seen simply holds nothing, which is the same answer every tier
   * check wants. Callers would otherwise have to wrap every lookup.
   */
  static async createOrNull(pubkey: string): Promise<StellarAccount | null> {
    try {
      return await StellarAccount.create(pubkey);
    } catch {
      return null;
    }
  }

  getTokenBalance(code: string, issuer: string): number {
    const asset = this.balances.find(
      (balance) =>
        (balance.asset_type === "credit_alphanum4" ||
          balance.asset_type === "credit_alphanum12") &&
        balance.asset_code === code &&
        balance.asset_issuer === issuer,
    );
    return asset ? Number(asset.balance) : 0;
  }

  hasTrustline(code: string, issuer: string): boolean {
    return this.balances.some(
      (balance) =>
        (balance.asset_type === "credit_alphanum4" ||
          balance.asset_type === "credit_alphanum12") &&
        balance.asset_code === code &&
        balance.asset_issuer === issuer,
    );
  }
}
