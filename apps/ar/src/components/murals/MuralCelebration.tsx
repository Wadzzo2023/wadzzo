import { motion, useReducedMotion } from "framer-motion";
import { Coins, PencilLine, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Confetti } from "~/components/fx/Confetti";
import { ArButton } from "~/components/ui/ArButton";
import type { ScanResult } from "@wadzzo/ar-core/murals/constants";
import { platformBranding } from "@wadzzo/platform/branding";

type Success = Exclude<ScanResult, { kind: "rejected" }>;

/**
 * ── MuralCelebration ───────────────────────────────────────────────────────
 *
 * Full screen, after a scan is accepted (same as the mobile app's): the
 * person's own photo of the wall flies in and lands in a frame with a
 * shockwave, gets stamped (Collected / Discovered / Confirmed), coins burst
 * out of it while the total counts up, then it goes to the map, focused on
 * that mural.
 *
 * The countdown bar shows when it will leave; a click leaves now. The first
 * finders can still name the mural: "Name this mural" stops the countdown
 * and hands over to the naming sheet.
 */

/** How long it stays before going to the map. */
const HOLD_MS = { collected: 4_200, discovered: 5_600, canName: 8_000 };
const COIN_COUNT = 10;
const FRAME_CORNERS = [
  "M2 22V10a8 8 0 0 1 8-8h12",
  "M58 2h12a8 8 0 0 1 8 8v12",
  "M78 78v12a8 8 0 0 1-8 8H58",
  "M22 98H10a8 8 0 0 1-8-8V78",
];

function useCountUp(to: number, delay: number) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = setTimeout(() => {
      const start = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / 1100);
        setV(Math.round(to * (1 - (1 - t) ** 3)));
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => {
      clearTimeout(t0);
      cancelAnimationFrame(raf);
    };
  }, [to, delay]);
  return v;
}

export function MuralCelebration({
  result,
  photo,
  onDone,
  onName,
}: {
  result: Success;
  photo: string | null;
  onDone: () => void;
  onName: () => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const discovered = result.kind === "discovered";
  const first = discovered && result.rank === 1;
  const canName = discovered && result.canName;
  const hsl = discovered ? "var(--rarity-legendary)" : "var(--rarity-epic)";
  const accent = `hsl(${hsl})`;
  const total = result.coins + (discovered ? result.bonus : 0);
  const shown = useCountUp(total, reduce ? 0 : 900);
  const hold = canName ? HOLD_MS.canName : discovered ? HOLD_MS.discovered : HOLD_MS.collected;

  // ── Leave for the map (once) ──
  // Read through a ref: the camera screen re-renders constantly, and a fresh
  // callback each time must not restart the countdown.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const left = useRef(false);
  const leave = () => {
    if (left.current) return;
    left.current = true;
    onDoneRef.current();
  };
  const [paused, setPaused] = useState(false);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (paused) return;
    const fire = setTimeout(() => setBurst((n) => n + 1), reduce ? 0 : 640);
    const exit = setTimeout(() => {
      if (left.current) return;
      left.current = true;
      onDoneRef.current();
    }, hold);
    return () => {
      clearTimeout(fire);
      clearTimeout(exit);
    };
  }, [paused, hold, reduce]);

  const stampText = discovered ? (first ? "Discovered" : "Confirmed") : "Collected";
  const headline = discovered
    ? first
      ? "You found a new mural!"
      : `Finder #${result.rank} — thanks for confirming!`
    : "Mural collected";

  return (
    <motion.div
      onClick={leave}
      role="button"
      aria-label="Continue to the map"
      className="bg-ar-void/94 absolute inset-0 z-[80] flex cursor-pointer flex-col items-center justify-center overflow-hidden px-8 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
    >
      {/* Rays turning slowly behind the frame. */}
      <motion.div
        aria-hidden
        className="absolute top-1/2 left-1/2 h-[800px] w-[800px]"
        style={{
          x: "-50%",
          y: "-50%",
          background: `conic-gradient(from 0deg, ${Array.from({ length: 6 }, (_, i) => `transparent ${i * 60}deg, hsl(${hsl}/0.55) ${i * 60 + 12}deg, transparent ${i * 60 + 26}deg`).join(", ")}, transparent 360deg)`,
          maskImage: "radial-gradient(circle, transparent 12%, black 34%, transparent 74%)",
          WebkitMaskImage: "radial-gradient(circle, transparent 12%, black 34%, transparent 74%)",
        }}
        initial={{ rotate: 0, scale: 0.6, opacity: 0 }}
        animate={{ rotate: 360, scale: 1, opacity: 0.5 }}
        transition={{
          rotate: { duration: 24, repeat: Infinity, ease: "linear" },
          scale: { duration: 0.9, ease: "easeOut" },
          opacity: { duration: 0.7, delay: 0.3 },
        }}
      />
      {/* Landing shockwave. */}
      <motion.span
        aria-hidden
        className="absolute top-[40%] left-1/2 h-48 w-48 rounded-full border-2"
        style={{ borderColor: accent, x: "-50%", y: "-50%" }}
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: [0.3, 3.5], opacity: [0, 0.85, 0] }}
        transition={{ duration: 1, delay: reduce ? 0 : 0.56, ease: "easeOut" }}
      />

      {/* ── The photo, framed like a found piece of street art ─────────── */}
      <div className="relative w-[56%] max-w-[220px] [perspective:1400px]">
        {!reduce &&
          Array.from({ length: COIN_COUNT }, (_, i) => {
            const spread = (i / (COIN_COUNT - 1) - 0.5) * 2;
            return (
              <motion.span
                key={i}
                aria-hidden
                className="bg-gold absolute top-1/2 left-1/2 -mt-[13px] -ml-[13px] flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-[#FFE7A3]"
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.6, rotate: i * 40 }}
                animate={{
                  x: [0, spread * 60, spread * 120 + (i % 2 ? 14 : -14)],
                  y: [0, -170 - (i % 3) * 20, -230 - (i % 3) * 34],
                  opacity: [0, 1, 0],
                  scale: [0.6, 1.2, 0.6],
                  rotate: i * 40 + 280,
                }}
                transition={{ delay: 0.9 + i * 0.07, duration: 1.1, ease: "easeOut" }}
              >
                <Coins size={13} strokeWidth={2.6} className="text-[#5A3A00]" />
              </motion.span>
            );
          })}
        <motion.div
          initial={reduce ? false : { y: 380, rotateY: 200, rotateZ: -19, scale: 0.65, opacity: 0 }}
          animate={{ y: 0, rotateY: 0, rotateZ: -3, scale: 1, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 140,
            damping: 15,
            mass: 1.1,
            opacity: { duration: 0.25 },
          }}
        >
          <motion.div
            className="bg-ar-surface relative aspect-[4/5] rounded-[18px] border-2 p-1.5"
            style={{ borderColor: accent, boxShadow: `0 0 40px -6px ${accent}` }}
            animate={reduce ? undefined : { y: [0, -8, 0] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: 0.9 }}
          >
            <div className="bg-ar-surface-2 h-full w-full overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: URL of the user's own photo */}
              {photo && <img src={photo} alt="" className="h-full w-full object-cover" />}
            </div>
            {/* Viewfinder corners, the scan's own mark. */}
            <svg
              viewBox="0 0 80 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden
            >
              {FRAME_CORNERS.map((d) => (
                <path
                  key={d}
                  d={d}
                  stroke="#fff"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  fill="none"
                  opacity={0.9}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            {/* The stamp, slammed onto the frame. */}
            <motion.span
              className="font-hud bg-ar-void/92 absolute -bottom-3.5 left-1/2 rounded-[9px] border-2 px-3.5 py-1 text-[13px] font-bold tracking-[0.28em] whitespace-nowrap uppercase"
              style={{
                x: "-50%",
                borderColor: accent,
                color: accent,
                boxShadow: `0 0 22px -4px ${accent}`,
              }}
              initial={reduce ? false : { scale: 2.6, rotate: -14, opacity: 0 }}
              animate={{ scale: 1, rotate: -4, opacity: 1 }}
              transition={{ delay: 0.64, type: "spring", stiffness: 460, damping: 15 }}
            >
              {stampText}
            </motion.span>
          </motion.div>
        </motion.div>
      </div>

      {/* ── Copy + coins ───────────────────────────────────────────────── */}
      <motion.div
        className="relative z-10 mt-9 flex flex-col items-center text-center"
        initial={reduce ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.76, type: "spring", stiffness: 300, damping: 22 }}
      >
        {discovered && (
          <p className="font-hud text-gold mb-2 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.2em] uppercase">
            <Sparkles size={13} strokeWidth={2.6} />
            {first ? "Discoverer" : `Finder #${result.rank}`}
          </p>
        )}
        <h2 className="font-hud text-ar-text max-w-[18rem] text-[20px] leading-tight font-bold">
          {headline}
        </h2>
        <p className="text-ar-dim mt-1 line-clamp-2 max-w-[18rem] text-[12.5px]">
          {result.mural.title}
        </p>

        <p className="border-gold/45 bg-gold/12 text-gold mt-3.5 inline-flex items-center gap-2 rounded-full border px-4 py-2">
          <Coins size={20} strokeWidth={2.4} />
          <span className="font-hud text-[24px] font-bold tabular-nums">+{shown}</span>
          <span className="font-hud text-ar-dim text-[10px] font-bold tracking-[0.14em] uppercase">
            {platformBranding.coinName}
          </span>
        </p>
        {discovered && result.bonus > 0 && (
          <p className="text-ar-dim mt-1.5 text-[11px]">
            {result.coins} for the scan ·{" "}
            <span className="text-gold font-semibold">+{result.bonus} discovery bonus</span>
          </p>
        )}
        <p className="text-ar-faint mt-1 text-[10px] tracking-[0.14em] uppercase">
          Balance {result.balance.toLocaleString()} · scans today {result.scansToday}/
          {result.dailyLimit}
        </p>

        {canName && !paused && (
          <ArButton
            variant="primary"
            size="md"
            icon={PencilLine}
            className="mt-4"
            onClick={(e) => {
              e.stopPropagation();
              setPaused(true);
              onName();
            }}
          >
            Name this mural
          </ArButton>
        )}
      </motion.div>

      {/* When it leaves for the map. */}
      {!paused && (
        <motion.div
          className="absolute inset-x-12 bottom-[6%] flex flex-col items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.4 }}
        >
          <div className="bg-ar-text/12 h-[3px] w-full overflow-hidden rounded-full">
            <motion.div
              className="h-full rounded-full"
              style={{ background: accent }}
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: hold / 1000, ease: "linear" }}
            />
          </div>
          <p className="font-hud text-ar-faint mt-2 text-[9.5px] tracking-[0.26em] uppercase">
            Opening the map · tap to go now
          </p>
        </motion.div>
      )}

      <Confetti
        trigger={burst}
        rarity={discovered ? "legendary" : "epic"}
        origin={{ x: 0.5, y: 0.4 }}
        count={discovered ? 150 : 100}
      />
    </motion.div>
  );
}
