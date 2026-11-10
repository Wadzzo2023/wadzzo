"use client";

import { ArrowUp, Camera, ChevronRight, Lock, Navigation, Trophy, X } from "lucide-react";

import { AR_CAPTURE_RADIUS, distanceMeters } from "@wadzzo/ar-core/ar/geo";
import type { GeoFix } from "@wadzzo/ar-core/ar/types";
import { estimateMinutes, straightSections } from "@wadzzo/geo/trail-geometry";
import { bearingDegrees, compassPoint, metresOffPath } from "@wadzzo/geo/trail-track";

import { cn } from "@wadzzo/ui/lib/cn";

import { ArButton } from "~/components/ui/ArButton";
import { distanceLabel, nextStop, trailColor, type FanTrail } from "~/lib/ar/trails";

/**
 * Follow mode (docs/trails), above the nearby rail: which trail, how far along, and a way
 * out. Slim, so the route stays in view; the next-stop card stacks under it.
 */
export function TrailProgressPill({
  trail,
  onOpen,
  onStop,
}: {
  trail: FanTrail;
  onOpen: () => void;
  onStop: () => void;
}) {
  const color = trailColor(trail);
  const { done, total, complete } = trail.progress;
  const rewardWaiting = Boolean(
    trail.reward && !trail.reward.claimed && trail.reward.remaining > 0,
  );

  // Finished: the same slim pill, with the reward (or the trail) one tap away.
  if (complete) {
    return (
      <div className="ar-glass flex h-10 items-center gap-2 rounded-full pr-1.5 pl-3">
        <Trophy size={14} className="text-ar-green-hot shrink-0" />
        <button
          type="button"
          onClick={onOpen}
          className="font-hud text-ar-text min-w-0 flex-1 truncate text-left text-[11px] font-bold tracking-[0.08em] uppercase"
        >
          {trail.title}
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="bg-ar-green/20 border-ar-green/50 text-ar-green-hot font-hud flex h-7 shrink-0 items-center gap-0.5 rounded-full border pr-1.5 pl-2.5 text-[10px] font-bold tracking-[0.12em] uppercase"
        >
          {rewardWaiting ? "Claim" : "Open"} <ChevronRight size={12} />
        </button>
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop following this trail"
          className="text-ar-dim hover:text-ar-text flex size-7 shrink-0 items-center justify-center rounded-full"
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="ar-glass flex h-10 items-center gap-2 rounded-full pr-1.5 pl-3">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <button
        type="button"
        onClick={onOpen}
        className="font-hud text-ar-text min-w-0 shrink truncate text-left text-[11px] font-bold tracking-[0.08em] uppercase"
      >
        {trail.title}
      </button>
      <div
        className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-white/10"
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
      <span className="font-hud text-ar-dim shrink-0 text-[11px] font-semibold tabular-nums">
        {done}/{total}
      </span>
      <button
        type="button"
        onClick={onStop}
        aria-label="Stop following this trail"
        className="text-ar-dim hover:text-ar-text flex size-7 shrink-0 items-center justify-center rounded-full"
      >
        <X size={15} />
      </button>
    </div>
  );
}

/** Further than this from the line (or the fix's accuracy, if worse) counts as off the trail. */
const OFF_TRAIL_METRES = 40;

/**
 * Follow mode, bottom of the map: the next stop, how far and how long, with Directions and
 * Capture in AR (the main button once you're in range). Nothing once the trail is finished:
 * the top pill and the finish sheet cover that.
 *
 * Off-road (a Hike trail, or a leg the brand left straight) there are no street directions to
 * give: the card shows a compass arrow to the next stop instead, and on a hike how far you are
 * from the trail's line.
 */
export function TrailNextCard({
  trail,
  fix,
  heading = null,
  onCapture,
  onDirections,
}: {
  trail: FanTrail;
  fix: GeoFix | null;
  /** Which way the phone faces (degrees from north), when the compass is trusted; else null. */
  heading?: number | null;
  onCapture: (pinId: string) => void;
  onDirections: (pinId: string) => void;
}) {
  const color = trailColor(trail);
  const { total, complete } = trail.progress;
  const next = complete ? null : nextStop(trail);
  const away = next && fix ? distanceMeters(fix, next) : null;
  const inRange = away !== null && away <= AR_CAPTURE_RADIUS;
  const hike = trail.mode === "HIKE";

  if (!next) return null;

  // The leg into the next stop, in walking order: straight when the brand didn't shape it.
  const at = trail.stops.findIndex((s) => s.position === next.position);
  const leg = at > 0 ? trail.path[at - 1] : undefined;
  const crowFlies = trail.order === "ORDERED" && at > 0 && (!leg || leg.length <= 2);
  const offRoad = hike || crowFlies;
  const bearing = fix && offRoad && !inRange ? bearingDegrees(fix, next) : null;
  const sections = trail.path.length ? trail.path : straightSections(trail.stops);
  const off = fix && hike ? metresOffPath(sections, fix) : null;
  const offTrail = off !== null && off > Math.max(OFF_TRAIL_METRES, fix?.accuracy ?? 0);

  return (
    <div className="ar-glass rounded-ar p-3">
      <div className="flex items-center gap-3">
        <span
          className="font-hud flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-white text-[13px] font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {next.lockReason ? <Lock size={13} /> : next.position}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-hud text-ar-faint text-[9.5px] font-semibold tracking-[0.16em] uppercase">
            Next · stop {next.position} of {total}
            {away !== null ? ` · ${distanceLabel(away)}` : ""}
            {away !== null && !inRange
              ? ` · ~${estimateMinutes(away, trail.mode as "WALK" | "HIKE" | "BIKE" | "DRIVE")} min`
              : ""}
          </p>
          <p className="text-ar-text truncate text-[14px] font-semibold">{next.title}</p>
          <p className="text-ar-dim flex items-center gap-1 truncate text-[11.5px]">
            {next.lockReason ? (
              <>
                <Lock size={10} /> {next.lockReason}
              </>
            ) : inRange ? (
              "You're here: capture it in AR"
            ) : (
              (next.clue ??
              (offRoad ? "Follow the line and the arrow" : "Head there, then capture it in AR"))
            )}
          </p>
        </div>
        {bearing !== null && (
          <div
            className="flex shrink-0 flex-col items-center"
            role="img"
            aria-label={`Next stop is ${compassPoint(bearing)}${heading === null ? " (north up)" : ""}`}
          >
            <span className="relative flex size-12 items-center justify-center rounded-full border border-white/15 bg-white/5">
              {/* North-up without a compass: a small N on the rim says so. */}
              {heading === null && (
                <span className="font-hud text-ar-faint absolute -top-0.5 text-[8px] font-bold">
                  N
                </span>
              )}
              <span
                className="flex transition-transform duration-300"
                style={{ transform: `rotate(${bearing - (heading ?? 0)}deg)` }}
              >
                <ArrowUp size={24} strokeWidth={2.8} style={{ color }} />
              </span>
            </span>
            <span className="font-hud text-ar-text mt-1 text-[10px] font-bold tracking-[0.12em]">
              {compassPoint(bearing)}
            </span>
          </div>
        )}
      </div>
      {(hike && off !== null) || crowFlies ? (
        <span
          className={cn(
            "mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            offTrail
              ? "bg-amber-500/15 text-amber-300"
              : hike
                ? "bg-ar-green/15 text-ar-green-hot"
                : "text-ar-dim bg-white/5",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              offTrail ? "bg-amber-400" : hike ? "bg-ar-green-hot" : "bg-white/40",
            )}
          />
          <span className="truncate">
            {offTrail
              ? `${distanceLabel(off)} off the trail · head back to the line`
              : hike
                ? "On the trail"
                : "No path for this leg · pick a safe way"}
          </span>
        </span>
      ) : null}
      {next.pinId && (
        <div className={hike ? "mt-2.5 grid grid-cols-1 gap-2" : "mt-2.5 grid grid-cols-2 gap-2"}>
          {/* Street directions don't help off-road: the line and the arrow do. */}
          {!hike && (
            <ArButton
              size="sm"
              variant={inRange ? "outline" : "primary"}
              icon={Navigation}
              onClick={() => onDirections(next.pinId!)}
            >
              Directions
            </ArButton>
          )}
          <ArButton
            size="sm"
            variant={inRange || hike ? "primary" : "outline"}
            icon={Camera}
            onClick={() => onCapture(next.pinId!)}
          >
            Capture in AR
          </ArButton>
        </div>
      )}
    </div>
  );
}
