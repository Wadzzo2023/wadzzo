import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";

import { requireEnv } from "@wadzzo/errors";

import { stellarNetwork } from "../config/stellar-network";
import type { CustodialSigner } from "../session/custodial-signer";
import { fetchCustodialAccountSecret } from "./custodial-account-secret";

/**
 * Signs a transaction XDR with `secretKey` and returns the signed envelope.
 * Works for classic and Soroban transactions alike: signing doesn't depend on
 * the operation type.
 */
export function signXdrWithSecret(xdr: string, secretKey: string): string {
  const transaction = TransactionBuilder.fromXDR(xdr, stellarNetwork.passphrase);
  transaction.sign(Keypair.fromSecret(secretKey));
  return transaction.toXDR();
}

/**
 * Server-side signing for accounts with no key in the browser. Returns the XDR
 * unchanged for real wallets, so the caller falls back to browser signing.
 */
export async function signXdrForCustodialUser({
  xdr,
  signWith,
}: {
  xdr: string;
  signWith?: CustodialSigner;
}): Promise<string> {
  if (!signWith) return xdr;

  if ("isAdmin" in signWith && signWith.isAdmin) {
    return signXdrWithSecret(xdr, requireEnv("MOTHER_SECRET", process.env.MOTHER_SECRET));
  }

  if ("email" in signWith && signWith.email) {
    return signXdrWithSecret(xdr, await fetchCustodialAccountSecret(signWith.email));
  }

  return xdr;
}
