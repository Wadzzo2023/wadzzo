"use client";

import { Camera, ChevronRight, Lock, Navigation, Trophy, X } from "lucide-react";

import { AR_CAPTURE_RADIUS, distanceMeters } from "@wadzzo/ar-core/ar/geo";
import type { GeoFix } from "@wadzzo/ar-core/ar/types";

import { ArButton } from "~/components/ui/ArButton";
import { distanceLabel, nextStop, trailColor, type FanTrail } from "~/lib/ar/trails";

/**
 * Follow mode's bar on the map (docs/trails): the trail, how far along you are, and the next
 * stop with what to do about it: capture it in AR when you're there, or get directions.
 * Finished, it offers the reward.
 */
export function TrailFollowBar({
  trail,
  fix,
  onOpen,
  onCapture,
  onDirections,
  onStop,
}: {
  trail: FanTrail;
  fix: GeoFix | null;
  onOpen: () => void;
  onCapture: (pinId: string) => void;
  onDirections: (pinId: string) => void;
  onStop: () => void;
}) {
  const color = trailColor(trail);
  const { done, total, complete } = trail.progress;
  const next = complete ? null : nextStop(trail);
  const away = next && fix ? distanceMeters(fix, next) : null;
  const inRange = away !== null && away <= AR_CAPTURE_RADIUS;

  return (
    <div className="ar-glass rounded-ar w-full p-3">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <button
          type="button"
          onClick={onOpen}
          className="font-hud text-ar-text min-w-0 flex-1 truncate text-left text-[12px] font-bold tracking-[0.08em] uppercase"
        >
          {trail.title}
        </button>
        <span className="font-hud text-ar-dim text-[11px] font-semibold tabular-nums">
          {done}/{total}
        </span>
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop following this trail"
          className="text-ar-dim hover:text-ar-text -mr-1 p-1"
        >
          <X size={15} />
        </button>
      </div>

      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label="Trail progress"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${total ? (done / total) * 100 : 0}%`, backgroundColor: color }}
        />
      </div>

      {complete ? (
        <div className="mt-2.5 flex items-center gap-2">
          <Trophy size={16} className="text-ar-green-hot shrink-0" />
          <p className="text-ar-text min-w-0 flex-1 text-[12.5px]">
            Trail complete{trail.reward && !trail.reward.claimed ? ": your reward is waiting" : ""}
          </p>
          <ArButton size="sm" variant="primary" iconRight={ChevronRight} onClick={onOpen}>
            {trail.reward && !trail.reward.claimed ? "Claim" : "Open"}
          </ArButton>
        </div>
      ) : next ? (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-ar-faint text-[10.5px] tracking-[0.12em] uppercase">
              Next · stop {next.position}
              {away !== null ? ` · ${distanceLabel(away)}` : ""}
            </p>
            <p className="text-ar-text truncate text-[13px] font-semibold">{next.title}</p>
            {next.lockReason && (
              <p className="text-ar-dim flex items-center gap-1 text-[11px]">
                <Lock size={10} /> {next.lockReason}
              </p>
            )}
          </div>
          {next.pinId &&
            (inRange ? (
              <ArButton
                size="sm"
                variant="primary"
                icon={Camera}
                onClick={() => onCapture(next.pinId!)}
              >
                Capture
              </ArButton>
            ) : (
              <ArButton size="sm" icon={Navigation} onClick={() => onDirections(next.pinId!)}>
                Go
              </ArButton>
            ))}
        </div>
      ) : null}
    </div>
  );
}
