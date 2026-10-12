"use client";

import toast from "react-hot-toast";

import { AppError, ErrorCodes } from "@wadzzo/errors";

import { getWalletProvider } from "../providers/registry";
import { type WalletType } from "../wallet-type";

export interface SignAndSubmitTransactionInput {
  /** The transaction to sign (base64 XDR). For custodial accounts and admins it is already signed. */
  xdr: string;
  /** The signer's Stellar public key. */
  publicKey: string | undefined;
  walletType: WalletType | string | undefined;
}

/**
 * Signs `xdr` with the user's wallet (or, for custodial accounts, just submits
 * what the server already signed) and sends it to Stellar.
 *
 * Resolves `true` once the network accepted it and `false` when the user didn't
 * sign. Throws `StellarTransactionError` when the network refuses it.
 */
export async function signAndSubmitTransaction({
  xdr,
  publicKey,
  walletType,
}: SignAndSubmitTransactionInput): Promise<boolean> {
  if (!walletType || !publicKey) {
    toast.error("problem with wallet type or pubkey, please reconnect wallet");
    return false;
  }

  const provider = getWalletProvider(walletType);
  if (!provider) {
    throw new AppError(ErrorCodes.WALLET_UNSUPPORTED_ACTION, {
      message: `Signing isn't supported for "${walletType}" wallets.`,
      details: { walletType },
    });
  }
  return provider.signAndSubmit(xdr, publicKey);
}
