"use client";

import { useSession } from "next-auth/react";

import { custodialSignerFor, type CustodialSigner } from "./custodial-signer";

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
    return user ? custodialSignerFor(user) : undefined;
  };

  return { getCustodialSigner };
}
