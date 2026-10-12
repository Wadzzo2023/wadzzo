import { cn } from "@wadzzo/ui/lib/cn";

/**
 * ── MuralViewfinder ────────────────────────────────────────────────────────
 *
 * The four brackets that frame what the detector looks at (the centre square
 * of the video — see useMuralDetector). Three looks:
 *
 *   searching   faint, slowly breathing; a thin meter fills with the score
 *   locked      snaps in a little and glows epic purple
 *   sweeping    stays locked; the gauge below takes over the guidance
 *
 * Transitions are CSS, not framer-motion, for the same reason as the QR
 * scanner: the detector loop shares the main thread.
 */
export function MuralViewfinder({
  state,
  score,
}: {
  state: "searching" | "locked" | "sweeping" | "idle";
  score: number;
}) {
  const locked = state === "locked" || state === "sweeping";
  return (
    <div className="pointer-events-none absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2">
      <div
        className={cn(
          "relative h-[248px] w-[248px] transition-transform duration-300 ease-out",
          locked ? "scale-[0.94]" : state === "searching" && "ar-mural-breathe",
        )}
      >
        <svg viewBox="0 0 248 248" fill="none" className="absolute inset-0 overflow-visible">
          {[
            "M3 66V23a20 20 0 0 1 20-20h43",
            "M182 3h43a20 20 0 0 1 20 20v43",
            "M245 182v43a20 20 0 0 1-20 20h-43",
            "M66 245H23a20 20 0 0 1-20-20v-43",
          ].map((d) => (
            <path
              key={d}
              d={d}
              stroke={locked ? "hsl(var(--rarity-epic))" : "hsl(0 0% 100% / 0.55)"}
              strokeWidth={locked ? 5 : 3.5}
              strokeLinecap="round"
              style={{
                transition: "stroke 250ms, stroke-width 250ms",
                filter: locked ? "drop-shadow(0 0 10px hsl(var(--rarity-epic) / 0.85))" : undefined,
              }}
            />
          ))}
        </svg>
      </div>

      {/* Confidence meter — only while searching; a lock replaces it. */}
      <div
        className={cn(
          "mx-auto mt-4 h-[3px] w-[148px] overflow-hidden rounded-full bg-white/15 transition-opacity duration-300",
          state === "searching" ? "opacity-100" : "opacity-0",
        )}
      >
        <div
          className="bg-rarity-epic h-full rounded-full transition-[width] duration-200"
          style={{ width: `${Math.round(Math.min(1, score) * 100)}%` }}
        />
      </div>
    </div>
  );
}
