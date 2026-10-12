import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useState } from "react";

import { packProgress, usePackSheet, useMuralPack } from "~/lib/murals/pack";

/**
 * ── PackRing ───────────────────────────────────────────────────────────────
 *
 * While the mural pack installs, a glowing progress ring wraps the raised AR
 * camera button — the pack is "charging" the camera (placement chosen
 * 2026-10-05). A small % badge rides on top; tapping it opens the game-style
 * panel (the AR button itself still opens the camera launcher). When the
 * pack finishes, the ring flashes green and fades away.
 *
 * Sized for the 62 px launcher key; sits 6 px outside it.
 */
export function PackRing() {
  const s = useMuralPack();
  const open = usePackSheet((x) => x.setOpen);
  const id = useId().replace(/:/g, "");
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!s.justFinished) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1600);
    return () => clearTimeout(t);
  }, [s.justFinished]);

  const busy =
    s.status === "checking" ||
    s.status === "downloading" ||
    s.status === "verifying" ||
    s.status === "error";
  const show = busy || flash;
  const p = flash ? 1 : packProgress(s);
  const R = 36;
  const C = 2 * Math.PI * R;
  const failed = s.status === "error";
  const spinning = s.status === "checking" || s.status === "verifying";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="ring"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.15 }}
          transition={{ duration: 0.35 }}
          className="pointer-events-none absolute -inset-[7px]"
        >
          <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90 overflow-visible">
            <defs>
              <linearGradient id={`pr-${id}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="hsl(190 95% 60%)" />
                <stop offset="1" stopColor="hsl(var(--rarity-epic))" />
              </linearGradient>
            </defs>
            <circle
              cx="38"
              cy="38"
              r={R}
              fill="none"
              stroke="hsl(var(--rarity-epic) / 0.22)"
              strokeWidth="4"
            />
            <circle
              cx="38"
              cy="38"
              r={R}
              fill="none"
              stroke={
                flash
                  ? "hsl(var(--ar-green-hot))"
                  : failed
                    ? "hsl(var(--ar-danger))"
                    : `url(#pr-${id})`
              }
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - p)}
              style={{
                transition: "stroke-dashoffset 300ms ease-out",
                filter: `drop-shadow(0 0 5px ${flash ? "hsl(var(--ar-green-hot))" : "hsl(var(--rarity-epic))"})`,
              }}
            />
            {spinning && (
              <circle
                cx="38"
                cy="38"
                r={R}
                fill="none"
                stroke="hsl(var(--rarity-epic))"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${C * 0.12} ${C}`}
                className="origin-center animate-spin"
                style={{ animationDuration: "1.4s" }}
              />
            )}
          </svg>

          {!flash && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                open(true);
              }}
              aria-label={
                failed
                  ? "Mural pack paused — show details"
                  : `Mural pack ${Math.floor(p * 100)}% — show details`
              }
              className={
                "font-hud pointer-events-auto absolute -top-[13px] left-1/2 -translate-x-1/2 rounded-full border px-1.5 py-[1px] text-[9.5px] font-bold tracking-[0.06em] whitespace-nowrap tabular-nums " +
                (failed
                  ? "border-ar-danger/70 bg-ar-void text-ar-danger"
                  : "border-rarity-epic/70 bg-ar-void text-rarity-epic shadow-[0_0_10px_-2px_hsl(var(--rarity-epic))]")
              }
            >
              {failed ? "PAUSED" : s.status === "verifying" ? "CHECK" : `${Math.floor(p * 100)}%`}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
