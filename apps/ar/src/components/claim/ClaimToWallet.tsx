"use client";

import { CheckCircle2, Loader2, Wallet } from "lucide-react";
import { useSession } from "next-auth/react";
import { signAndSubmitTransaction } from "@wadzzo/wallet";
import { useState } from "react";

import { ArButton } from "~/components/ui/ArButton";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { env } from "~/env";
import { formatAmount } from "@wadzzo/stellar/quote";
import { cn } from "@wadzzo/ui/lib/cn";
import { api } from "~/utils/api";
import { AppError, ErrorCodes } from "@wadzzo/errors";

type Method = "PLATFORM_ASSET" | "XLM";

/**
 * "Claim to wallet" on a collected pin that carries an item: shows what it
 * costs (and whether it will go through) before anything is signed, then
 * delivers the item on-chain — from the brand's stock, or minted right then.
 */
export function ClaimToWallet({ pinId }: { pinId: string }) {
  const session = useSession();
  const state = api.claim.forPin.useQuery(
    { pinId },
    { enabled: session.status === "authenticated" },
  );
  const [open, setOpen] = useState(false);

  const claim = state.data;
  if (!claim) return null;

  // A plain pin has no reward to deliver: collecting it was all there is.
  if (claim.state === "none" || !claim.reward) {
    return (
      <div className="ar-bevel rounded-ar flex items-center gap-3 p-3.5">
        <CheckCircle2 size={20} className="text-ar-green-hot shrink-0" strokeWidth={2.2} />
        <div className="min-w-0">
          <p className="font-hud text-ar-text text-[13px] font-bold">Claimed</p>
          <p className="text-ar-dim text-[12px]">You collected this pin.</p>
        </div>
      </div>
    );
  }
  const reward = claim.reward;

  if (claim.state === "delivered") {
    return (
      <div className="ar-bevel rounded-ar flex items-center gap-3 p-3.5">
        <CheckCircle2 size={20} className="text-ar-green-hot shrink-0" strokeWidth={2.2} />
        <div className="min-w-0">
          <p className="font-hud text-ar-text text-[13px] font-bold">In your wallet</p>
          <p className="text-ar-dim truncate text-[12px]">{reward.name} is yours on Stellar.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ArButton
        variant="primary"
        size="lg"
        block
        icon={Wallet}
        busy={claim.state === "pending"}
        onClick={() => setOpen(true)}
      >
        {claim.state === "pending" ? "Claim in progress…" : "Claim reward"}
      </ArButton>
      <ClaimSheet
        open={open}
        onClose={() => setOpen(false)}
        consumerId={claim.consumerId}
        itemName={reward.name}
        pending={claim.state === "pending"}
        onDone={() => void state.refetch()}
      />
    </>
  );
}

function ClaimSheet({
  open,
  onClose,
  consumerId,
  itemName,
  pending,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  consumerId: string;
  itemName: string;
  pending: boolean;
  onDone: () => void;
}) {
  const session = useSession();
  const [method, setMethod] = useState<Method>("PLATFORM_ASSET");
  const [step, setStep] = useState<"idle" | "signing" | "confirming" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const quote = api.claim.quote.useQuery(
    { consumerId, method },
    {
      enabled: open && !pending,
      staleTime: 20_000,
      placeholderData: (prev) => prev,
    },
  );
  const prepare = api.claim.prepare.useMutation();
  const confirm = api.claim.confirm.useMutation();
  const utils = api.useUtils();
  const q = quote.data;
  const busy = step === "signing" || step === "confirming" || prepare.isPending;

  const run = async () => {
    setError(null);
    try {
      const res = await prepare.mutateAsync({ consumerId, method });
      if (!res.ok) {
        utils.claim.quote.setData({ consumerId, method }, res.quote);
        return;
      }
      setStep("signing");
      const submitted = await signAndSubmitTransaction({
        xdr: res.xdr,
        walletType: session.data?.user.walletType,
        publicKey: session.data?.user.id,
      });
      if (!submitted)
        throw new AppError(ErrorCodes.WALLET_SIGNING_REJECTED, {
          message: "The transaction wasn't signed.",
        });
      setStep("confirming");
      const result = await confirm.mutateAsync({ txId: res.txId });
      if (result?.status === "FAILED")
        throw new AppError(ErrorCodes.STELLAR_TX_REJECTED, {
          message: result.error ?? "The transaction failed.",
        });
      setStep("done");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStep("idle");
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => (busy ? undefined : onClose())}
      labelledBy="claim-title"
      dismissible={!busy}
    >
      <div className="px-6 pt-3 pb-5">
        {step === "done" ? (
          <div className="py-4 text-center">
            <CheckCircle2 size={36} className="text-ar-green-hot mx-auto" strokeWidth={2} />
            <h2 id="claim-title" className="font-hud text-ar-text mt-3 text-[19px] font-bold">
              It&apos;s in your wallet
            </h2>
            <p className="text-ar-dim mx-auto mt-1.5 max-w-[18rem] text-[12.5px] leading-relaxed">
              {itemName} was delivered to your Stellar wallet.
            </p>
            <ArButton variant="outline" size="md" block className="mt-5" onClick={onClose}>
              Done
            </ArButton>
          </div>
        ) : (
          <>
            <h2 id="claim-title" className="font-hud text-ar-text text-[19px] font-bold">
              Claim to wallet
            </h2>
            <p className="text-ar-dim mt-1 text-[12.5px] leading-relaxed">
              Move <b className="text-ar-text">{itemName}</b> into your Stellar wallet. You pay what
              it costs to deliver — nothing else.
            </p>

            <div
              className="ar-bevel rounded-ar mt-4 grid grid-cols-2 gap-1 p-1"
              role="radiogroup"
              aria-label="Pay with"
            >
              {(
                [
                  ["PLATFORM_ASSET", "Wadzzo"],
                  ["XLM", "XLM"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={method === id}
                  disabled={busy}
                  onClick={() => setMethod(id)}
                  className={cn(
                    "font-hud h-9 rounded-[10px] text-[12px] font-semibold tracking-[0.1em] uppercase transition-colors",
                    method === id ? "text-ar-text bg-white/10" : "text-ar-faint",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 min-h-24">
              {pending ? (
                <p className="rounded-ar text-ar-dim bg-white/[0.04] p-3 text-[12.5px]">
                  A claim for this is already in progress. It will settle on its own.
                </p>
              ) : !q ? (
                <div className="text-ar-faint flex items-center justify-center py-8">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              ) : (
                <>
                  <ul className="ar-bevel divide-ar-line rounded-ar divide-y">
                    {q.lines.map((l) => (
                      <li
                        key={l.key}
                        className="flex items-start justify-between gap-3 px-3.5 py-2.5"
                      >
                        <span className="min-w-0">
                          <span className="text-ar-text block text-[12.5px]">{l.label}</span>
                          {l.hint && (
                            <span className="text-ar-faint block text-[11px]">{l.hint}</span>
                          )}
                        </span>
                        <span
                          className={cn(
                            "font-hud shrink-0 text-[12.5px] font-semibold tabular-nums",
                            !l.inTotal && "text-ar-faint",
                          )}
                        >
                          {formatAmount(l.amount, l.currency)}
                        </span>
                      </li>
                    ))}
                    <li className="flex items-center justify-between px-3.5 py-2.5">
                      <span className="font-hud text-ar-text text-[12px] font-bold tracking-[0.1em] uppercase">
                        Total
                      </span>
                      <span className="font-hud text-ar-text text-[15px] font-bold tabular-nums">
                        {formatAmount(q.total, q.currency)}
                      </span>
                    </li>
                  </ul>
                  {q.source && (
                    <p className="text-ar-faint mt-2 text-[11.5px]">
                      {q.source === "stock"
                        ? "From the brand's stock."
                        : "Minted for you when you claim."}
                    </p>
                  )}
                  {q.problems.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {q.problems.map((p) => (
                        <li
                          key={p.code + p.message}
                          className="rounded-ar bg-red-500/10 px-3 py-2 text-[12px] text-red-300"
                        >
                          {p.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {error && (
              <p className="rounded-ar mt-3 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
                {error}
              </p>
            )}

            <ArButton
              variant="primary"
              size="lg"
              block
              className="mt-4"
              busy={busy}
              disabled={!q?.ok || pending || busy}
              onClick={() => void run()}
            >
              {step === "signing"
                ? "Confirm in your wallet…"
                : step === "confirming"
                  ? "Confirming on Stellar…"
                  : prepare.isPending
                    ? "Preparing…"
                    : q
                      ? `Claim for ${formatAmount(q.total, q.currency)}`
                      : "Claim"}
            </ArButton>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
