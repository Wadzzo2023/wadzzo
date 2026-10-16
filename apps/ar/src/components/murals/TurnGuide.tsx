import { ChevronLeft, ChevronRight } from "lucide-react";

import type { SweepStep } from "~/lib/murals/useMuralSweep";
import { cn } from "@wadzzo/ui/lib/cn";

/**
 * ── Turn guide (2026-10-05 round) ─────────────────────────────────────────
 *
 * EdgeChevrons — three chevrons flowing along the screen edge you should
 * turn towards. Pure CSS animation (`.ar-chevron-*` in arcade.css), so it
 * stays smooth while the detector shares the main thread. The rest of the
 * turn guidance is in ScanCoach.tsx.
 */

export function EdgeChevrons({ step }: { step: SweepStep }) {
  // Holding on the mural for the middle photo: nothing to turn to yet.
  if (step === "done" || step === "centre") return null;
  const sides: ("left" | "right")[] = step === "left" ? ["left"] : ["right"];
  return (
    <>
      {sides.map((side) => {
        const pointLeft = side === "left";
        const Icon = pointLeft ? ChevronLeft : ChevronRight;
        return (
          <div
            key={side}
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 z-[6] flex -translate-y-1/2",
              side === "left" ? "left-1" : "right-1",
              pointLeft ? "flex-row" : "flex-row-reverse",
            )}
          >
            {[0, 1, 2].map((i) => (
              <Icon
                key={i}
                size={34}
                strokeWidth={3}
                className={cn(
                  "-mx-2.5 text-white drop-shadow-[0_0_8px_hsl(var(--rarity-epic))]",
                  pointLeft ? "ar-chevron-left" : "ar-chevron-right",
                )}
                style={{ animationDelay: `${(pointLeft ? i : 2 - i) * 0.16}s` }}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}
