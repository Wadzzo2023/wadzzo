"use client";

import { motion } from "framer-motion";
import { Gift, Trophy } from "lucide-react";
import { useState } from "react";

import { ClaimToWallet } from "~/components/claim/ClaimToWallet";
import { ArButton } from "~/components/ui/ArButton";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { distanceLabel, trailColor, type FanTrail } from "~/lib/ar/trails";
import { api } from "~/utils/api";

/**
 * Finish (docs/trails): the moment the last stop is collected. A trophy, what you did, and
 * the reward with Claim right here; once claimed, the usual Claim to wallet. Shown once per
 * trail (the follow store remembers), then the trail page keeps the same actions.
 */
export function TrailCompleteSheet({
  trail: t,
  open,
  onClose,
}: {
  trail: FanTrail;
  open: boolean;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const [error, setError] = useState<string | null>(null);
  const [thumbBroken, setThumbBroken] = useState(false);
  const claim = api.trails.claimReward.useMutation({
    onSuccess: () => void utils.trails.get.invalidate({ id: t.id }),
    onError: (e) => setError(e.message),
  });
  const color = trailColor(t);
  const reward = t.reward;
  const canClaim = Boolean(reward && !reward.claimed && reward.remaining > 0);

  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="trail-complete-title">
      <div className="px-5 pt-2 pb-2 text-center">
        <motion.div
          initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 14, delay: 0.1 }}
          className="mx-auto flex size-16 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}33`, boxShadow: `0 0 36px ${color}66` }}
        >
          <Trophy size={30} style={{ color }} />
        </motion.div>
        <p className="font-hud text-ar-green mt-3 text-[10px] font-semibold tracking-[0.28em] uppercase">
          Trail complete
        </p>
        <h2 id="trail-complete-title" className="font-hud text-ar-text mt-1 text-[20px] font-bold">
          {t.title}
        </h2>
        <p className="text-ar-dim mt-1 text-[12.5px]">
          {t.progress.done}/{t.progress.total} stops · {distanceLabel(t.distanceMetres)} ·{" "}
          {t.brand.name}
        </p>

        {reward && (
          <div className="ar-bevel rounded-ar mt-4 flex items-center gap-3 p-3 text-left">
            <div className="bg-ar-green/10 flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[12px]">
              {reward.thumbnail && !thumbBroken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={reward.thumbnail}
                  alt=""
                  className="size-full object-cover"
                  onError={() => setThumbBroken(true)}
                />
              ) : (
                <Gift size={22} className="text-ar-green-hot" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-hud text-ar-faint text-[9.5px] font-semibold tracking-[0.2em] uppercase">
                Your reward
              </p>
              <p className="text-ar-text truncate text-[14px] font-semibold">{reward.name}</p>
              <p className="text-ar-dim text-[11.5px]">
                {reward.claimed
                  ? "It's yours"
                  : reward.remaining > 0
                    ? `${reward.remaining} left`
                    : "All claimed, sorry"}
              </p>
            </div>
          </div>
        )}

        {error && <p className="text-ar-danger mt-3 text-[12px]">{error}</p>}

        <div className="mt-4 space-y-2">
          {canClaim ? (
            <ArButton
              block
              size="lg"
              variant="primary"
              icon={Trophy}
              busy={claim.isPending}
              onClick={() => {
                setError(null);
                claim.mutate({ id: t.id });
              }}
            >
              Claim reward
            </ArButton>
          ) : reward?.claimed && reward.pinId ? (
            <ClaimToWallet pinId={reward.pinId} />
          ) : null}
          <ArButton block variant="ghost" onClick={onClose}>
            {canClaim ? "Later" : "Done"}
          </ArButton>
        </div>
      </div>
    </BottomSheet>
  );
}
