import type { FeeBumpTransaction, Transaction } from "@stellar/stellar-sdk";

/** A transaction's hash as the lowercase hex string Horizon and explorers use. */
export function getTransactionHashHex(transaction: Transaction | FeeBumpTransaction): string {
  return Buffer.from(transaction.hash()).toString("hex");
}
