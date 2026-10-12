import { ChevronLeft, ChevronRight } from "lucide-react";

import type { SweepStep } from "~/lib/murals/useMuralSweep";
import { cn } from "@wadzzo/ui/lib/cn";

/**
 * ── Turn guide (2026-10-05 round) ─────────────────────────────────────────
 *
 * EdgeChevrons — three chevrons flowing along the screen edge you should
 * turn towards (both edges, pointing inward, for "back to the middle").
 * GhostPhone — a small phone above the gauge that turns the way to turn.
 * Pure CSS animation (`.ar-chevron-*`, `.ar-ghost-phone-*` in arcade.css),
 * so it stays smooth while the detector shares the main thread.
 */

export function EdgeChevrons({ step }: { step: SweepStep }) {
  if (step === "done") return null;
  const sides: ("left" | "right")[] = step === "left" ? ["left"] : step === "right" ? ["right"] : ["left", "right"];
  return (
    <>
      {sides.map((side) => {
        // Pointing outwards for left/right, inwards for "centre".
        const pointLeft = step === "centre" ? side === "right" : side === "left";
        const Icon = pointLeft ? ChevronLeft : ChevronRight;
        return (
          <div
            key={side}
            aria-hidden
            className={cn("pointer-events-none absolute top-1/2 z-[6] flex -translate-y-1/2", side === "left" ? "left-1" : "right-1", pointLeft ? "flex-row" : "flex-row-reverse")}
          >
            {[0, 1, 2].map((i) => (
              <Icon
                key={i}
                size={34}
                strokeWidth={3}
                className={cn("-mx-2.5 text-white drop-shadow-[0_0_8px_hsl(var(--rarity-epic))]", pointLeft ? "ar-chevron-left" : "ar-chevron-right")}
                style={{ animationDelay: `${(pointLeft ? i : 2 - i) * 0.16}s` }}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

export function GhostPhone({ step }: { step: SweepStep }) {
  if (step === "done") return null;
  return (
    <div aria-hidden className="mx-auto mb-1 flex h-9 items-center justify-center [perspective:240px]">
      <svg
        viewBox="0 0 24 40"
        width={20}
        height={32}
        className={cn(step === "left" ? "ar-ghost-phone-left" : step === "right" ? "ar-ghost-phone-right" : "ar-ghost-phone-centre")}
      >
        <rect x="1.5" y="1.5" width="21" height="37" rx="4.5" fill="hsl(var(--rarity-epic) / 0.25)" stroke="#fff" strokeWidth="2" />
        <rect x="9" y="4.5" width="6" height="1.6" rx="0.8" fill="#fff" opacity="0.8" />
        <circle cx="12" cy="20" r="4.5" fill="none" stroke="#fff" strokeWidth="1.6" opacity="0.9" />
      </svg>
    </div>
  );
}
