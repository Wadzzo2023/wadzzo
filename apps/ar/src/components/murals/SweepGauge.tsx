import { Smartphone } from "lucide-react";

import { SWEEP_SIDE_DEG } from "@wadzzo/ar-core/murals/constants";
import type { SweepStep } from "~/lib/murals/useMuralSweep";
import { cn } from "@wadzzo/ui/lib/cn";

/**
 * ── SweepGauge ─────────────────────────────────────────────────────────────
 *
 * A horizontal track with three stops (left, centre, right) and a phone
 * glyph riding on the live turn angle. Each stop fills when its keyframe is
 * taken, so the person sees the scan being built rather than waiting on a
 * timer. The stop they're heading for pulses.
 */

/** Track spans this many degrees each way, a bit past the targets. */
const RANGE = SWEEP_SIDE_DEG * 1.6;

const STOPS: { slot: 0 | 1 | 2; at: number; label: string; step: SweepStep }[] = [
  { slot: 0, at: -SWEEP_SIDE_DEG, label: "Left", step: "left" },
  { slot: 1, at: 0, label: "Centre", step: "centre" },
  { slot: 2, at: SWEEP_SIDE_DEG, label: "Right", step: "right" },
];

const pos = (deg: number) => 50 + (Math.max(-RANGE, Math.min(RANGE, deg)) / RANGE) * 50;

export function SweepGauge({
  delta,
  step,
  captured,
}: {
  delta: number;
  step: SweepStep;
  captured: [boolean, boolean, boolean];
}) {
  return (
    <div className="relative mx-auto h-14 w-full max-w-[17rem]" aria-hidden>
      <div className="absolute inset-x-0 top-[27px] h-[3px] rounded-full bg-white/15" />

      {STOPS.map((s) => {
        const done = captured[s.slot];
        const next = s.step === step;
        return (
          <div
            key={s.slot}
            className="absolute top-0 -translate-x-1/2 text-center"
            style={{ left: `${pos(s.at)}%` }}
          >
            <span className="font-hud text-ar-faint block text-[9px] font-bold tracking-[0.14em] uppercase">
              {s.label}
            </span>
            <span
              className={cn(
                "mx-auto mt-[9px] block h-3 w-3 rounded-full border-2 transition-colors duration-200",
                done
                  ? "border-rarity-epic bg-rarity-epic shadow-[0_0_10px_hsl(var(--rarity-epic)/0.9)]"
                  : next
                    ? "border-rarity-epic animate-pulse bg-transparent"
                    : "border-white/40 bg-transparent",
              )}
            />
          </div>
        );
      })}

      <div
        className="absolute top-[18px] -translate-x-1/2 transition-[left] duration-100 ease-linear"
        style={{ left: `${pos(delta)}%` }}
      >
        <span className="text-ar-void flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,.45)]">
          <Smartphone size={13} strokeWidth={2.6} />
        </span>
      </div>
    </div>
  );
}
