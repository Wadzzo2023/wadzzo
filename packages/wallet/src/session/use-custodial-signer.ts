"use client";

import { useSession } from "next-auth/react";

import type { CustodialSigner } from "./custodial-signer";
import { isCustodialWallet } from "../wallet-type";

/**
 * `getCustodialSigner()` says whom the server must sign for: pass its result
 * as `signWith` to procedures that build a transaction. It is `undefined` for
 * real wallets, which sign in the browser with `signAndSubmitTransaction`.
 */
export function useCustodialSigner() {
  const session = useSession();

  const getCustodialSigner = (asAdmin?: true): CustodialSigner => {
    if (asAdmin) return { isAdmin: true };
    const user = session.data?.user;
    if (user?.email && isCustodialWallet(user.walletType)) return { email: user.email };
    return undefined;
  };

  return { getCustodialSigner };
}
