import { Horizon, Keypair, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import type { Session } from "next-auth";

import { env } from "~/env";
import { STELLAR_URL, networkPassphrase } from "@wadzzo/wallet/config";

import type { Caller } from "./context";
import { HttpError } from "./http";
import { platformBranding } from "@wadzzo/platform/branding";

const CUSTODIAL = new Set(["emailPass", "google", "facebook", "apple"]);

/**
 * Only the transaction `brands.followXdr` builds may be relayed: mother's
 * 0.5 XLM reserve top-up to the user, plus a `changeTrust` sourced from the
 * user. Anything else is refused, so this endpoint can't be used to push
 * arbitrary signed transactions to the network.
 */
function assertFollowTx(xdr: string, userId: string) {
  let tx;
  try {
    tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  } catch {
    throw new HttpError(400, "BAD_REQUEST", "That isn't a valid transaction");
  }
  // A fee-bump wrapper is never what followXdr produces.
  if (!(tx instanceof Transaction)) {
    throw new HttpError(400, "BAD_REQUEST", "Unexpected transaction type");
  }
  const mother = Keypair.fromSecret(env.MOTHER_SECRET).publicKey();
  if (tx.source !== mother) {
    throw new HttpError(
      400,
      "BAD_REQUEST",
      `Transaction wasn't prepared by ${platformBranding.name}`,
    );
  }
  const ok = tx.operations.every((op) => {
    if (op.type === "changeTrust") return op.source === userId;
    if (op.type === "payment") {
      return op.destination === userId && op.asset.isNative() && Number(op.amount) <= 0.5;
    }
    return false;
  });
  if (!ok || !tx.operations.some((op) => op.type === "changeTrust")) {
    throw new HttpError(400, "BAD_REQUEST", "That isn't a follow transaction");
  }
  return tx;
}

async function submit(xdr: string, userId: string) {
  const tx = assertFollowTx(xdr, userId);
  try {
    await new Horizon.Server(STELLAR_URL).submitTransaction(tx);
  } catch (e) {
    const codes = (e as { response?: { data?: { extras?: { result_codes?: unknown } } } }).response
      ?.data?.extras?.result_codes;
    console.error("[mobile follow] submit failed", codes ?? e);
    throw new HttpError(
      502,
      "SUBMIT_FAILED",
      "The network rejected the follow transaction. Try again.",
    );
  }
}

/**
 * The app's one-call follow (docs/02-api.md → Follow):
 *
 *  - already trusts the asset          → record the follow
 *  - custodial wallet (email/social)   → XDR is co-signed server-side
 *                                        (`signXdrForCustodialUser`); submit it here, then record
 *  - self-custody (Albedo)             → `{ needsSignature, xdr }`; the app has
 *                                        Albedo sign it and calls back with
 *                                        `signedXdr`, which is submitted here
 *
 * `brands.follow` re-checks the trustline on-chain before writing the row,
 * so nothing here can record a follow that didn't really happen.
 */
export async function followBrand(
  caller: Caller,
  session: Session,
  brandId: string,
  signedXdr: string | undefined,
) {
  const userId = session.user.id;

  if (signedXdr) {
    await submit(signedXdr, userId);
    return caller.brands.follow({ brandId });
  }

  const step = await caller.brands.followXdr({ brandId });
  if (step.alreadyTrusted) return caller.brands.follow({ brandId });

  if (CUSTODIAL.has(session.user.walletType ?? "")) {
    await submit(step.xdr, userId);
    return caller.brands.follow({ brandId });
  }

  return { needsSignature: true as const, xdr: step.xdr };
}
