import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { z } from "zod";
import { getAccSecretFromRubyApi } from "package/connect_wallet/src/lib/stellar/get-acc-secret";
import { env } from "~/env";
import { networkPassphrase } from "./constant";

/**
 * Signs a raw transaction XDR with a keypair and returns the re-serialized,
 * signed envelope. Network-agnostic — works for both classic and Soroban
 * invoke transactions, since envelope signing doesn't depend on the
 * operation type.
 */
export function signXdrTransaction(xdr: string, secretKey: string): string {
  const transaction = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  const keypair = Keypair.fromSecret(secretKey);
  transaction.sign(keypair);
  return transaction.toXDR();
}

// Email/Google/Facebook/Apple logins have no on-device keypair — the acting
// user's real secret lives outside this app, fetched by email. `isAdmin` is
// a distinct, separate custodial identity signed with the platform's own key.
export const SignUser = z
  .object({ email: z.string() })
  .optional()
  .or(z.object({ isAdmin: z.boolean() }));
export type SignUserType = z.TypeOf<typeof SignUser>;

/**
 * Custodial signing for wallet types with no on-device key. Returns the XDR
 * unchanged for real wallets (Freighter/Albedo/xBull/Rabet/walletConnect/
 * metamask/hana/hotWallet) so the caller falls back to client-side signing.
 */
export async function WithSing({
  xdr,
  signWith,
}: {
  xdr: string;
  signWith?: SignUserType;
}): Promise<string> {
  if (!signWith) return xdr;

  if ("isAdmin" in signWith && signWith.isAdmin) {
    return signXdrTransaction(xdr, env.MOTHER_SECRET);
  }

  if ("email" in signWith && signWith.email) {
    const secretKey = await getAccSecretFromRubyApi(signWith.email);
    return signXdrTransaction(xdr, secretKey);
  }

  return xdr;
}
