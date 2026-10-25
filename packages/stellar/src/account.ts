import { Asset, BadRequestError, type Horizon, NotFoundError } from "@stellar/stellar-sdk";

import { AppError, ErrorCodes } from "@wadzzo/errors";
import { BASE_RESERVE_XLM, MAX_SUBENTRIES, PLATFORM_ASSET } from "@wadzzo/wallet/config";
import { horizonServer } from "@wadzzo/wallet/stellar";

export type Balances = Horizon.HorizonApi.AccountResponse["balances"];
export type AssetRef = { code: string; issuer: string };

export const toAsset = ({ code, issuer }: AssetRef) => new Asset(code, issuer);

/**
 * A loaded Stellar account with the questions every check asks: does it trust
 * an asset, how much does it hold, and how much XLM is really spendable once
 * reserves and open offers are set aside.
 *
 * Holdings are read live from Horizon rather than from the database: there is
 * no balance column on `User`, and a holding can change without any app seeing
 * the transaction.
 */
export class StellarAccount {
  private constructor(
    readonly id: string,
    readonly raw: Horizon.AccountResponse,
  ) {}

  /**
   * The account, or `null` when it doesn't exist on-chain yet (an unfunded wallet holds nothing).
   * An id Horizon rejects as malformed (400) counts as no account too, instead of failing the
   * whole request with "Bad Request".
   */
  static async load(id: string): Promise<StellarAccount | null> {
    try {
      return new StellarAccount(id, await horizonServer().loadAccount(id));
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      if (error instanceof BadRequestError) {
        console.warn(`[stellar] not a valid account id: ${id.slice(0, 8)}…`);
        return null;
      }
      throw error;
    }
  }

  /** The account, or a `STELLAR_ACCOUNT_NOT_FOUND` error when it isn't active on Stellar. */
  static async loadOrThrow(id: string, label = "Account"): Promise<StellarAccount> {
    const account = await StellarAccount.load(id);
    if (!account) {
      throw new AppError(ErrorCodes.STELLAR_ACCOUNT_NOT_FOUND, {
        message: `${label} ${id.slice(0, 6)}… is not active on Stellar`,
        details: { publicKey: id },
      });
    }
    return account;
  }

  get balances(): Balances {
    return this.raw.balances;
  }

  get subentries() {
    return this.raw.subentry_count;
  }

  private line(code: string, issuer: string | undefined) {
    return this.balances.find(
      (balance) =>
        (balance.asset_type === "credit_alphanum4" || balance.asset_type === "credit_alphanum12") &&
        balance.asset_code === code &&
        balance.asset_issuer === issuer,
    ) as Horizon.HorizonApi.BalanceLineAsset | undefined;
  }

  hasTrustline(code: string, issuer: string | undefined): boolean {
    return Boolean(this.line(code, issuer));
  }

  /** Balance of an asset (0 without a trustline). */
  tokenBalance(code: string, issuer: string | undefined): number {
    return Number(this.line(code, issuer)?.balance ?? 0);
  }

  /** How many more units of the asset the trustline accepts. */
  tokenRoom(code: string, issuer: string | undefined): number {
    const line = this.line(code, issuer);
    if (!line) return 0;
    return Number(line.limit) - Number(line.balance) - Number(line.buying_liabilities);
  }

  platformBalance(): number {
    return this.tokenBalance(PLATFORM_ASSET.code, PLATFORM_ASSET.issuer);
  }

  trustsPlatformAsset(): boolean {
    return this.hasTrustline(PLATFORM_ASSET.code, PLATFORM_ASSET.issuer);
  }

  private nativeLine() {
    return this.balances.find(
      (balance): balance is Horizon.HorizonApi.BalanceLineNative => balance.asset_type === "native",
    );
  }

  nativeBalance(): number {
    return Number(this.nativeLine()?.balance ?? 0);
  }

  /** XLM locked by the account itself: (2 + subentries + sponsoring − sponsored) × 0.5. */
  minimumBalance(): number {
    // Horizon returns these; the SDK's AccountResponse type just doesn't declare them.
    const { num_sponsoring = 0, num_sponsored = 0 } = this.raw as unknown as {
      num_sponsoring?: number;
      num_sponsored?: number;
    };
    return (2 + this.subentries + num_sponsoring - num_sponsored) * BASE_RESERVE_XLM;
  }

  /** XLM that can be spent right now (balance − reserves − XLM locked in sell offers). */
  spendableXlm(): number {
    const selling = Number(this.nativeLine()?.selling_liabilities ?? 0);
    return Math.max(0, this.nativeBalance() - this.minimumBalance() - selling);
  }

  canAddSubentries(count = 1): boolean {
    return this.subentries + count <= MAX_SUBENTRIES;
  }
}

/** Whether a transaction with this hash made it on-chain successfully (`null` = not found yet). */
export async function transactionSucceeded(hash: string): Promise<boolean | null> {
  try {
    const transaction = await horizonServer().transactions().transaction(hash).call();
    return transaction.successful;
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}
