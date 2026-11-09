"use client";

import { Check, Footprints, Gift, Lock, MapPinned, Play, Trophy } from "lucide-react";
import { useState } from "react";

import { ClaimToWallet } from "~/components/claim/ClaimToWallet";
import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { TrailShape } from "~/components/trails/TrailShape";
import { ArButton } from "~/components/ui/ArButton";
import { StatBlock } from "~/components/ui/Badges";
import { Skeleton } from "~/components/ui/Skeleton";
import { useAuth } from "~/lib/ar/store";
import { distanceLabel, nextStop, trailColor, useFollowTrail } from "~/lib/ar/trails";
import { useQueryParams, useRouter } from "~/lib/navigation";
import { cn } from "@wadzzo/ui/lib/cn";
import { api } from "~/utils/api";

const MODE: Record<string, string> = { WALK: "walk", BIKE: "ride", DRIVE: "drive" };

/**
 * ── /trails/[id] ───────────────────────────────────────────────────────────
 *
 * One trail: its shape, stops, rules and reward, with Start (or Continue) to follow it on the
 * map. Stops are collected the usual way (AR, auto-collect or QR); on an ordered trail each
 * required stop waits for the one before. Finished, the reward is claimed here and then sent
 * to the wallet like any pin's item.
 */
export default function TrailScreen() {
  const router = useRouter();
  const { query } = useQueryParams();
  const id = typeof query.id === "string" ? query.id : "";
  const requireAuth = useAuth((s) => s.requireAuth);
  const follow = useFollowTrail((s) => s.follow);
  const followingId = useFollowTrail((s) => s.trailId);
  const utils = api.useUtils();
  const [error, setError] = useState<string | null>(null);
  const [thumbBroken, setThumbBroken] = useState(false);

  const trail = api.trails.get.useQuery({ id }, { enabled: Boolean(id), retry: false });
  const start = api.trails.start.useMutation({
    onSuccess: (t) => {
      utils.trails.get.setData({ id }, t);
      void utils.trails.mine.invalidate();
      follow(t.id);
      void router.push("/map");
    },
    onError: (e) => setError(e.message),
  });
  const claim = api.trails.claimReward.useMutation({
    onSuccess: () => void utils.trails.get.invalidate({ id }),
    onError: (e) => setError(e.message),
  });

  const t = trail.data;
  if (!t) {
    return (
      <AppShell tabs={false}>
        <div className="flex h-full flex-col">
          <ScreenHeader back eyebrow="Trail" title={trail.isError ? "Not found" : "Loading…"} />
          <div className="space-y-3 px-5">
            {trail.isError ? (
              <p className="text-ar-dim text-[13px]">
                This trail has ended or isn&rsquo;t available.
              </p>
            ) : (
              <>
                <Skeleton className="aspect-square w-full" />
                <Skeleton className="h-12 w-full" />
              </>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  const color = trailColor(t);
  const { done, total, complete, requiredTotal } = t.progress;
  const next = nextStop(t);
  const onTrail = followingId === t.id;

  const onStart = () => {
    if (!requireAuth("collect")) return;
    setError(null);
    if (t.run) {
      follow(t.id);
      void router.push("/map");
    } else start.mutate({ id: t.id });
  };

  return (
    <AppShell tabs={false}>
      <div className="flex h-full flex-col">
        <ScreenHeader back eyebrow={t.brand.name} title={t.title} />
        <div className="ar-scroll flex-1 px-5 pb-8">
          <TrailShape trail={t} size={280} numbers className="mx-auto aspect-square w-full" />

          <div className="ar-bevel rounded-ar mt-4 grid grid-cols-3 py-3">
            <StatBlock label="Stops" value={total} />
            <StatBlock label="Distance" value={distanceLabel(t.distanceMetres)} />
            <StatBlock label={`Min ${MODE[t.mode] ?? ""}`} value={`~${t.estMinutes}`} />
          </div>

          {t.description && (
            <p className="text-ar-dim mt-4 text-[13px] leading-relaxed whitespace-pre-line">
              {t.description}
            </p>
          )}

          <p className="text-ar-faint mt-3 flex items-center gap-1.5 text-[11.5px]">
            <Footprints size={12} />
            {t.order === "ORDERED"
              ? "Collect the stops in order: each one unlocks the next."
              : "Collect the stops in any order."}
            {requiredTotal < total ? " Optional stops are a bonus." : ""}
          </p>

          {/* Progress / finish */}
          {t.run && (
            <div className="ar-bevel rounded-ar mt-4 p-3.5">
              <div className="flex items-center justify-between">
                <p className="font-hud text-ar-text text-[12px] font-bold tracking-[0.1em] uppercase">
                  {complete ? "Trail complete" : "Your progress"}
                </p>
                <span className="font-hud text-ar-dim text-[12px] tabular-nums">
                  {done}/{total}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${total ? (done / total) * 100 : 0}%`, backgroundColor: color }}
                />
              </div>
            </div>
          )}

          {/* Reward */}
          {t.reward && (
            <div className="ar-bevel rounded-ar mt-4 flex items-center gap-3 p-3.5">
              {t.reward.thumbnail && !thumbBroken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.reward.thumbnail}
                  alt=""
                  className="size-11 rounded-lg object-cover"
                  onError={() => setThumbBroken(true)}
                />
              ) : (
                <Gift size={22} className="text-ar-green-hot" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-ar-faint text-[10.5px] tracking-[0.12em] uppercase">
                  Finishing reward
                </p>
                <p className="text-ar-text truncate text-[13.5px] font-semibold">{t.reward.name}</p>
                <p className="text-ar-dim text-[11.5px]">
                  {t.reward.claimed
                    ? "Yours"
                    : t.reward.remaining > 0
                      ? `${t.reward.remaining} left`
                      : "All claimed"}
                </p>
              </div>
              {complete && !t.reward.claimed && t.reward.remaining > 0 && (
                <ArButton
                  size="sm"
                  variant="primary"
                  icon={Trophy}
                  busy={claim.isPending}
                  onClick={() => claim.mutate({ id: t.id })}
                >
                  Claim
                </ArButton>
              )}
            </div>
          )}
          {t.reward?.claimed && t.reward.pinId && (
            <div className="mt-3">
              <ClaimToWallet pinId={t.reward.pinId} />
            </div>
          )}

          {error && <p className="text-ar-danger mt-3 text-[12px]">{error}</p>}

          {!complete && (
            <ArButton
              block
              size="lg"
              variant="primary"
              icon={t.run ? MapPinned : Play}
              className="mt-5"
              busy={start.isPending}
              onClick={onStart}
            >
              {t.run ? (onTrail ? "Back to the map" : "Continue on the map") : "Start trail"}
            </ArButton>
          )}

          {/* Stops */}
          <h2 className="font-hud text-ar-faint mt-6 mb-2 text-[10px] font-semibold tracking-[0.28em] uppercase">
            Stops
          </h2>
          <ol className="space-y-2">
            {t.stops.map((s) => (
              <li
                key={s.position}
                className={cn(
                  "rounded-ar flex items-center gap-3 border border-white/5 bg-white/[0.03] p-2.5",
                  next?.position === s.position && !complete && "border-ar-green/50",
                  (Boolean(s.lockReason) || s.unavailable) && !s.done && "opacity-60",
                )}
              >
                <span
                  className="font-hud flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                  style={{ backgroundColor: s.required ? color : "rgba(255,255,255,0.2)" }}
                >
                  {s.done ? <Check size={14} strokeWidth={3} /> : s.position}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.imageUrl} alt="" className="size-10 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="text-ar-text truncate text-[13px] font-semibold">{s.title}</p>
                  <p className="text-ar-dim truncate text-[11.5px]">
                    {s.done
                      ? "Collected"
                      : s.unavailable
                        ? "No longer available"
                        : (s.lockReason ??
                          s.clue ??
                          (s.required ? "Next up" : "Optional bonus stop"))}
                  </p>
                </div>
                {s.lockReason && !s.done && <Lock size={14} className="text-ar-faint" />}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </AppShell>
  );
}
