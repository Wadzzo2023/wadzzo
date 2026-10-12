import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BrandMark } from "~/components/brand/BrandMark";
import { BOOT_LINES } from "~/lib/ar/mock";
import { platformBranding } from "@wadzzo/platform/branding";

/**
 * ── BootSequence ───────────────────────────────────────────────────────────
 *
 * The first three seconds of the app, and for a lot of people the only three
 * seconds they'll judge it on — this is what loads after someone scans a QR
 * code on a table tent, before they have any idea what Wadzzo is.
 *
 * It plays as an overlay above the live map rather than as its own route, so
 * the final beat is a real reveal: the iris opens onto the map that has been
 * mounting and fetching underneath the whole time. No white flash, no second
 * loading state.
 *
 * Five beats:
 *   ignite    a scanline sweeps a dead screen; the terrain grid comes up
 *   assemble  the brand mark drops in, then W-A-D-Z-Z-O fly in from depth
 *             and land with chromatic fringing
 *   stamp     the AR plate slams down and throws a shockwave
 *   boot      status lines type out over a five-segment charge bar
 *   open      the iris opens onto the map
 *
 * Tap anywhere to skip. `prefers-reduced-motion` skips straight to done —
 * a full-screen kinetic logo is exactly what that setting exists to prevent.
 */

const WORDMARK = platformBranding.wordmark.letters;

/** Beat boundaries in ms from mount. Tuned so the charge bar never waits. */
const T = {
  assemble: 320,
  stamp: 1_180,
  boot: 1_560,
  open: 3_180,
  done: 3_900,
} as const;

type Phase = "ignite" | "assemble" | "stamp" | "boot" | "open";

export function BootSequence({ onDone }: { onDone: () => void }) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("ignite");
  const [lineIndex, setLineIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }, [onDone]);

  // ── Beat scheduler ─────────────────────────────────────────────────────
  useEffect(() => {
    if (reduceMotion) {
      finish();
      return;
    }
    const timers = [
      setTimeout(() => setPhase("assemble"), T.assemble),
      setTimeout(() => setPhase("stamp"), T.stamp),
      setTimeout(() => setPhase("boot"), T.boot),
      setTimeout(() => setPhase("open"), T.open),
      setTimeout(finish, T.done),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reduceMotion, finish]);

  // ── Status line typewriter ─────────────────────────────────────────────
  // Each line gets an equal share of the boot beat, split between typing it
  // out and letting it sit there long enough to actually be read.
  const perLine = (T.open - T.boot) / BOOT_LINES.length;

  useEffect(() => {
    if (phase !== "boot") return;
    const id = setInterval(() => {
      setLineIndex((i) => Math.min(i + 1, BOOT_LINES.length - 1));
    }, perLine);
    return () => clearInterval(id);
  }, [phase, perLine]);

  useEffect(() => {
    if (phase !== "boot") return;
    const target = BOOT_LINES[lineIndex] ?? "";
    setTyped("");
    let i = 0;
    const step = Math.max(12, (perLine * 0.55) / target.length);
    const id = setInterval(() => {
      i += 1;
      setTyped(target.slice(0, i));
      if (i >= target.length) clearInterval(id);
    }, step);
    return () => clearInterval(id);
  }, [phase, lineIndex, perLine]);

  const started = phase !== "ignite";
  const opening = phase === "open";

  // Drifting background coins. Positions are memoised so a re-render from the
  // typewriter doesn't teleport them.
  const coins = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        id: i,
        left: [12, 78, 30, 88, 55, 6, 68][i]!,
        top: [22, 16, 74, 58, 88, 52, 34][i]!,
        size: [30, 22, 38, 18, 26, 34, 20][i]!,
        delay: i * 0.42,
      })),
    [],
  );

  if (reduceMotion) return null;

  return (
    <motion.div
      role="status"
      aria-label={`Loading ${platformBranding.name} AR`}
      onClick={finish}
      className="absolute inset-0 z-[100] cursor-pointer select-none overflow-hidden bg-ar-void"
      initial={{ opacity: 1 }}
      animate={
        opening
          ? {
              // The iris: the whole plate scales up and past the viewer as it
              // clears, so the map appears to have been behind it all along.
              scale: 1.35,
              opacity: 0,
              filter: "blur(14px)",
            }
          : { scale: 1, opacity: 1, filter: "blur(0px)" }
      }
      transition={{ duration: 0.72, ease: [0.7, 0, 0.28, 1] }}
    >
      {/* ── Backdrop ──────────────────────────────────────────────────── */}
      <motion.div
        className="ar-grid absolute inset-0 [mask-image:radial-gradient(62%_52%_at_50%_46%,black,transparent)]"
        initial={{ opacity: 0, scale: 1.25 }}
        animate={{ opacity: started ? 0.9 : 0, scale: started ? 1 : 1.25 }}
        transition={{ duration: 1.1, ease: "easeOut" }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,hsl(var(--ar-green)/0.26),transparent_64%)] blur-[60px]"
        // Centring lives in motion's own `x`/`y`, not Tailwind's
        // `-translate-*`: motion writes a complete inline `transform` for the
        // values it animates, which silently drops the utility's translate.
        style={{ x: "-50%", y: "-50%" }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: started ? 1 : 0, scale: started ? 1 : 0.5 }}
        transition={{ duration: 1.3, ease: "easeOut" }}
      />

      {coins.map((c) => (
        <motion.span
          key={c.id}
          aria-hidden
          className="absolute rounded-full border border-ar-green/40 bg-linear-to-br from-ar-green/25 to-transparent"
          style={{
            left: `${c.left}%`,
            top: `${c.top}%`,
            width: c.size,
            height: c.size,
          }}
          initial={{ opacity: 0, y: 26, rotate: -30 }}
          animate={{
            opacity: started ? [0, 0.75, 0.45] : 0,
            y: started ? [26, -14, 6] : 26,
            rotate: started ? [-30, 18, -8] : -30,
          }}
          transition={{
            duration: 6,
            delay: c.delay,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Ignition scanline — one pass, then it's gone. */}
      <AnimatePresence>
        {phase === "ignite" && (
          <motion.div
            key="scan"
            className="absolute inset-x-0 h-[3px] bg-linear-to-r from-transparent via-ar-green-hot to-transparent shadow-[0_0_30px_6px_hsl(var(--ar-green)/0.75)]"
            initial={{ top: "-4%" }}
            animate={{ top: "104%" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.44, ease: "easeIn" }}
          />
        )}
      </AnimatePresence>

      {/* ── Centre stack ──────────────────────────────────────────────── */}
      <div className="relative flex h-full flex-col items-center justify-center px-8">
        <BootMark started={started} />
        <Wordmark phase={phase} />

        {/* Tagline */}
        <motion.p
          className="mt-5 text-center text-[12.5px] leading-relaxed text-ar-dim"
          initial={{ opacity: 0, y: 8 }}
          animate={{
            opacity: phase === "boot" || opening ? 1 : 0,
            y: phase === "boot" || opening ? 0 : 8,
          }}
          transition={{ duration: 0.45 }}
        >
          Collect the real world.
        </motion.p>

        {/* ── Charge bar + status line ──────────────────────────────── */}
        <motion.div
          className="absolute inset-x-0 bottom-[13%] flex flex-col items-center gap-3 px-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === "boot" ? 1 : opening ? 0 : 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="flex w-full max-w-[240px] gap-[5px]">
            {BOOT_LINES.map((_, i) => (
              <div
                key={i}
                className="h-[3px] flex-1 overflow-hidden rounded-full bg-ar-surface-3"
              >
                <motion.div
                  className="h-full rounded-full bg-ar-green-hot shadow-[0_0_10px_hsl(var(--ar-green)/0.9)]"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: i <= lineIndex ? 1 : 0 }}
                  style={{ originX: 0 }}
                  transition={{ duration: perLine / 1000, ease: "linear" }}
                />
              </div>
            ))}
          </div>

          <p className="font-hud flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.24em] text-ar-green">
            <span className="tabular-nums text-ar-faint">
              {String(lineIndex + 1).padStart(2, "0")}
            </span>
            <span>{typed}</span>
            <span className="animate-blink inline-block h-[10px] w-[6px] bg-ar-green-hot" />
          </p>
        </motion.div>

        {/* Skip affordance — only once it's clear there's something to skip. */}
        <motion.p
          className="font-hud absolute bottom-[5%] text-[9.5px] uppercase tracking-[0.3em] text-ar-faint"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === "boot" ? 0.75 : 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          Tap to skip
        </motion.p>
      </div>

      {/* Shockwave from the AR stamp, thrown across the whole plate. */}
      <AnimatePresence>
        {(phase === "stamp" || phase === "boot") && (
          <motion.span
            key="shock"
            aria-hidden
            className="absolute left-1/2 top-1/2 h-40 w-40 rounded-full border-2 border-ar-green-hot"
            style={{ x: "-50%", y: "-50%" }}
            initial={{ scale: 0.2, opacity: 0.9 }}
            animate={{ scale: 6, opacity: 0 }}
            transition={{ duration: 1.05, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      <div className="ar-scanlines pointer-events-none absolute inset-0 opacity-40" />
    </motion.div>
  );
}

/**
 * The brand icon above the wordmark. Drops in first — slightly ahead of the
 * letters below it — the way a logo lockup reads top-down: mark, then name.
 * A one-shot spring lands it; a small infinite float keeps it from sitting
 * dead still through the several seconds of typewriter beat that follow,
 * the same idle-bob treatment map pins and holo cards use elsewhere.
 */
function BootMark({ started }: { started: boolean }) {
  return (
    <BrandMark
      glow
      className="mb-2 h-[70px] w-auto"
      initial={{ opacity: 0, scale: 2.2, rotate: -16, filter: "blur(10px)" }}
      animate={
        started
          ? { opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)", y: [0, -6, 0] }
          : { opacity: 0, scale: 2.2, rotate: -16, filter: "blur(10px)" }
      }
      transition={{
        default: { type: "spring", stiffness: 240, damping: 20, mass: 0.9 },
        y: { duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 0.6 },
      }}
    />
  );
}

/**
 * The wordmark. Each glyph arrives from its own random point in depth, blurred
 * and rotated, and springs onto the baseline. Two tinted copies sit behind the
 * white one and converge on it — cheap chromatic aberration that reads as a
 * lens pulling focus, and which costs one extra paint rather than a filter.
 */
function Wordmark({ phase }: { phase: Phase }) {
  const landed = phase !== "ignite" && phase !== "assemble";
  const showAr = phase === "stamp" || phase === "boot" || phase === "open";

  return (
    <div className="relative flex items-center justify-center">
      {/* Chromatic ghosts */}
      {(
        [
          ["hsl(358 90% 62%)", -7],
          ["hsl(186 95% 60%)", 7],
        ] as const
      ).map(([color, dx]) => (
        <motion.span
          key={color}
          aria-hidden
          className="font-hud pointer-events-none absolute text-[52px] font-bold leading-none tracking-[0.04em] mix-blend-screen"
          style={{ color }}
          initial={{ x: dx * 3, opacity: 0 }}
          animate={{
            x: landed ? 0 : dx,
            opacity: phase === "ignite" ? 0 : landed ? 0 : 0.85,
          }}
          transition={{ type: "spring", stiffness: 180, damping: 18 }}
        >
          {platformBranding.wordmark.letters.join("")}
        </motion.span>
      ))}

      <h1 className="font-hud relative flex text-[52px] font-bold leading-none tracking-[0.04em] text-ar-text">
        {WORDMARK.map((letter, i) => (
          <motion.span
            key={`${letter}-${i}`}
            className="inline-block"
            initial={{
              opacity: 0,
              y: [-90, 70, -60, 84, -74, 62][i]!,
              x: [-40, 34, -22, 30, -30, 26][i]!,
              rotate: [-38, 30, -22, 34, -28, 20][i]!,
              scale: 2.1,
              filter: "blur(12px)",
            }}
            animate={
              phase === "ignite"
                ? {}
                : {
                    opacity: 1,
                    y: 0,
                    x: 0,
                    rotate: 0,
                    scale: 1,
                    filter: "blur(0px)",
                  }
            }
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20,
              mass: 0.85,
              delay: i * 0.055,
            }}
          >
            {letter}
          </motion.span>
        ))}

        {/* The AR plate, stamped into the corner of the wordmark. */}
        <motion.span
          className="font-hud absolute -right-[54px] -top-[6px] flex h-[30px] items-center rounded-[8px] border border-ar-green px-[9px] text-[16px] font-bold tracking-[0.12em] text-ar-green-hot"
          style={{
            background: "hsl(var(--ar-green) / 0.14)",
            boxShadow:
              "0 0 22px -2px hsl(var(--ar-green)/0.8), inset 0 0 14px -4px hsl(var(--ar-green)/0.9)",
          }}
          initial={{ opacity: 0, scale: 3.4, rotate: -14 }}
          animate={
            showAr
              ? { opacity: 1, scale: 1, rotate: -6 }
              : { opacity: 0, scale: 3.4, rotate: -14 }
          }
          transition={{ type: "spring", stiffness: 420, damping: 17, mass: 0.8 }}
        >
          {platformBranding.wordmark.plate}
        </motion.span>
      </h1>
    </div>
  );
}
