import { Horizon, Transaction, xdr } from "@stellar/stellar-sdk";

import { stellarNetwork } from "../config/stellar-network";
import { StellarTransactionError } from "../errors/stellar-transaction-error";

/** Result of a transaction the network accepted. */
export interface SubmittedTransaction {
  readonly success: true;
  readonly message: string;
  readonly hash: string;
}

/** Parses a base64 XDR envelope against this deployment's network. */
export const parseTransactionXdr = (envelopeXdr: string): Transaction =>
  new Transaction(
    xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64"),
    stellarNetwork.passphrase,
  );

/**
 * Submits an already-signed transaction to Horizon.
 * Throws `StellarTransactionError` (with the Stellar result code) if it is refused.
 */
export async function submitSignedTransaction(signedXdr: string): Promise<SubmittedTransaction> {
  try {
    const server = new Horizon.Server(stellarNetwork.horizonUrl);
    const result = await server.submitTransaction(parseTransactionXdr(signedXdr));
    return { success: true, message: "Transaction submitted successfully", hash: result.hash };
  } catch (error) {
    const wrapped = new StellarTransactionError(error);
    console.error("[stellar] submit failed", wrapped.resultCode, wrapped.technicalDetails);
    throw wrapped;
  }
}

/** True when the account exists on the network and holds at least one balance. */
export async function isStellarAccountActive(publicKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${stellarNetwork.horizonUrl}/accounts/${publicKey}`);
    if (!response.ok) return false;
    const account = (await response.json()) as { id?: string; balances?: unknown[] };
    return Boolean(account.id && account.balances && account.balances.length > 0);
  } catch {
    return false;
  }
}
