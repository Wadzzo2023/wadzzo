"use client";

import { useSession } from "next-auth/react";
import { signAndSubmitTransaction } from "@wadzzo/wallet";
import { useState } from "react";

import { env } from "~/env";
import { api } from "~/utils/api";
import { AppError, ErrorCodes } from "@wadzzo/errors";

export type SignStep = "idle" | "signing" | "confirming" | "done" | "failed";

/**
 * The last mile of every on-chain action the server prepared: the wallet
 * signs and submits (custodial accounts were already signed on the server),
 * then the server confirms the result on Stellar and records it.
 */
export function useSignAndConfirm() {
  const session = useSession();
  const confirm = api.tx.confirm.useMutation();
  const [step, setStep] = useState<SignStep>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(xdr: string) {
    const submitted = await signAndSubmitTransaction({
      xdr: xdr,
      walletType: session.data?.user.walletType,
      publicKey: session.data?.user.id,
    });
    if (!submitted)
      throw new AppError(ErrorCodes.WALLET_SIGNING_REJECTED, {
        message: "The transaction wasn't signed.",
      });
  }

  /** Sign and submit something with no ledger row (e.g. a follow trustline). */
  async function signOnly(xdr: string) {
    setError(null);
    setStep("signing");
    try {
      await submit(xdr);
      setStep("done");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStep("failed");
      return false;
    }
  }

  async function run({ txId, xdr }: { txId: string; xdr: string | null }) {
    setError(null);
    try {
      if (xdr) {
        setStep("signing");
        await submit(xdr);
      }
      setStep("confirming");
      const result = await confirm.mutateAsync({ txId });
      if (result?.status === "SUCCESS") {
        setStep("done");
        return true;
      }
      if (result?.status === "FAILED")
        throw new AppError(ErrorCodes.STELLAR_TX_REJECTED, {
          message: result.error ?? "The transaction failed.",
        });
      // Still pending on Horizon: it will settle; history shows the outcome.
      setStep("done");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStep("failed");
      return false;
    }
  }

  return {
    run,
    signOnly,
    step,
    error,
    busy: step === "signing" || step === "confirming",
    reset: () => (setStep("idle"), setError(null)),
  };
}
