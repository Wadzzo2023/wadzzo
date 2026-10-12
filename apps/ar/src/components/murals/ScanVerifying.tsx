import { motion } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { RejectCode } from "~/lib/murals/constants";
import { cn } from "@wadzzo/ui/lib/cn";

/**
 * ── ScanVerifying ──────────────────────────────────────────────────────────
 *
 * The 1–3 s while the server checks a sweep. The three keyframes the person
 * just took sit on top, then three checks tick in order. The ticks pace
 * themselves so there's something to watch, but the last one never turns
 * green until the server has actually said yes — and a rejection lands on
 * the row it belongs to.
 */

const CHECKS = ["Street art", "Right place", "Not a screen"] as const;

/** Which row a reject code belongs to; null = not one of the three. */
export function failedCheck(code: RejectCode): number | null {
  if (code === "NOT_ART" || code === "UNSAFE") return 0;
  if (code === "GPS_WEAK" || code === "NO_SWEEP" || code === "SESSION_EXPIRED") return 1;
  if (code === "SCREEN" || code === "WEB_COPY") return 2;
  return null;
}

export function ScanVerifying({
  frames,
  outcome,
}: {
  /** Object URLs: left, centre, right. */
  frames: string[];
  /** null while waiting; "ok" or the failed row once the server answers. */
  outcome: null | "ok" | { failed: number | null };
}) {
  const [paced, setPaced] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setPaced(1), 550);
    const b = setTimeout(() => setPaced(2), 1100);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  const rowState = (i: number): "wait" | "spin" | "ok" | "fail" => {
    if (outcome && outcome !== "ok" && outcome.failed === i) return "fail";
    if (outcome && outcome !== "ok" && outcome.failed != null && i > outcome.failed) return "wait";
    if (outcome === "ok") return "ok";
    if (i < paced) return "ok";
    return i === paced ? "spin" : "wait";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="ar-glass mx-auto w-full max-w-[19rem] rounded-ar-lg p-5"
      role="status"
      aria-live="polite"
    >
      <div className="flex justify-center gap-2">
        {frames.map((src, i) => (
          <motion.img
            key={src}
            src={src}
            alt=""
            initial={{ opacity: 0, scale: 0.8, rotate: (i - 1) * 6 }}
            animate={{ opacity: 1, scale: 1, rotate: (i - 1) * 4 }}
            transition={{ delay: i * 0.06 }}
            className={cn(
              "h-[74px] w-[56px] rounded-[10px] border object-cover",
              i === 1 ? "border-rarity-epic/70" : "border-white/25",
            )}
          />
        ))}
      </div>

      <p className="font-hud mt-4 text-center text-[12.5px] font-bold uppercase tracking-[0.12em] text-ar-text">
        Checking your scan
      </p>

      <ul className="mt-3 space-y-2">
        {CHECKS.map((label, i) => {
          const st = rowState(i);
          return (
            <li key={label} className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border",
                  st === "ok" && "border-ar-green/60 bg-ar-green/18 text-ar-green-hot",
                  st === "fail" && "border-ar-danger/60 bg-ar-danger/15 text-ar-danger",
                  (st === "wait" || st === "spin") && "border-ar-line text-ar-faint",
                )}
              >
                {st === "ok" && <Check size={12} strokeWidth={3} />}
                {st === "fail" && <X size={12} strokeWidth={3} />}
                {st === "spin" && <Loader2 size={12} strokeWidth={2.6} className="animate-spin" />}
              </span>
              <span className={cn("text-[12.5px]", st === "wait" ? "text-ar-faint" : "text-ar-text")}>{label}</span>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}
