import { Asset, Horizon, NotFoundError } from "@stellar/stellar-sdk";

import { BASE_RESERVE_XLM, MAX_SUBENTRIES, PLATFORM_ASSET, STELLAR_URL } from "./constant";

/**
 * ── Stellar account ────────────────────────────────────────────────────────
 *
 * A loaded account with the questions every check asks: does it trust an
 * asset, how much does it hold, and how much XLM is really spendable once
 * reserves and open offers are set aside.
 *
 * Tier eligibility is deliberately read live from Horizon rather than from
 * anything in Postgres — there is no balance column on `User`, and a holding
 * can change without this app ever seeing the transaction.
 */

export type Balances = Horizon.HorizonApi.AccountResponse["balances"];
export type AssetRef = { code: string; issuer: string };

export const horizon = () => new Horizon.Server(STELLAR_URL);
export const toAsset = ({ code, issuer }: AssetRef) => new Asset(code, issuer);

export class StellarAccount {
  private constructor(
    readonly id: string,
    readonly raw: Horizon.AccountResponse,
  ) {}

  /** The account, or null when it doesn't exist on-chain yet. */
  static async load(id: string): Promise<StellarAccount | null> {
    try {
      return new StellarAccount(id, await horizon().loadAccount(id));
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
  }

  static async loadOrThrow(id: string, label = "Account"): Promise<StellarAccount> {
    const acc = await StellarAccount.load(id);
    if (!acc) throw new Error(`${label} ${id.slice(0, 6)}… is not active on Stellar`);
    return acc;
  }

  static async create(pubkey: string) {
    return StellarAccount.loadOrThrow(pubkey);
  }

  /**
   * Never throws for an unfunded or unknown account — a wallet that Horizon
   * has never seen simply holds nothing, which is the same answer every tier
   * check wants. Callers would otherwise have to wrap every lookup.
   */
  static async createOrNull(pubkey: string): Promise<StellarAccount | null> {
    try {
      return await StellarAccount.load(pubkey);
    } catch {
      return null;
    }
  }

  get balances(): Balances {
    return this.raw.balances;
  }

  get subentries() {
    return this.raw.subentry_count;
  }

  private line(code: string, issuer: string) {
    return this.balances.find(
      (b) =>
        (b.asset_type === "credit_alphanum4" || b.asset_type === "credit_alphanum12") &&
        b.asset_code === code &&
        b.asset_issuer === issuer,
    ) as Horizon.HorizonApi.BalanceLineAsset | undefined;
  }

  hasTrustline(code: string, issuer: string): boolean {
    return Boolean(this.line(code, issuer));
  }

  /** Balance of an asset (0 without a trustline). */
  tokenBalance(code: string, issuer: string): number {
    return Number(this.line(code, issuer)?.balance ?? 0);
  }

  getTokenBalance(code: string, issuer: string): number {
    return this.tokenBalance(code, issuer);
  }

  platformBalance() {
    return this.tokenBalance(PLATFORM_ASSET.code, PLATFORM_ASSET.issuer);
  }

  trustsPlatformAsset() {
    return this.hasTrustline(PLATFORM_ASSET.code, PLATFORM_ASSET.issuer);
  }

  nativeBalance() {
    const n = this.balances.find((b): b is Horizon.HorizonApi.BalanceLineNative => b.asset_type === "native");
    return Number(n?.balance ?? 0);
  }

  /** XLM locked by the account itself: (2 + subentries + sponsoring − sponsored) × 0.5. */
  minimumBalance() {
    // Horizon returns these; the SDK's AccountResponse type just doesn't declare them.
    const { num_sponsoring = 0, num_sponsored = 0 } = this.raw as unknown as { num_sponsoring?: number; num_sponsored?: number };
    return (2 + this.subentries + num_sponsoring - num_sponsored) * BASE_RESERVE_XLM;
  }

  /** XLM that can be spent right now (balance − reserves − XLM locked in sell offers). */
  spendableXlm() {
    const n = this.balances.find((b): b is Horizon.HorizonApi.BalanceLineNative => b.asset_type === "native");
    const selling = Number(n?.selling_liabilities ?? 0);
    return Math.max(0, this.nativeBalance() - this.minimumBalance() - selling);
  }

  canAddSubentries(count = 1) {
    return this.subentries + count <= MAX_SUBENTRIES;
  }
}

/** Whether a transaction with this hash made it on-chain successfully (null = not found yet). */
export async function transactionSucceeded(hash: string): Promise<boolean | null> {
  try {
    const tx = await horizon().transactions().transaction(hash).call();
    return tx.successful;
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}
