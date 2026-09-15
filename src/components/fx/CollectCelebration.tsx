import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import { RARITY_META } from "~/lib/ar/rarity";
import type { ArPin } from "~/lib/ar/types";
import { HoloCard } from "~/components/cards/HoloCard";
import { Confetti } from "./Confetti";

/**
 * ── CollectCelebration ─────────────────────────────────────────────────────
 *
 * The pack-open beat. Capturing a pin is the single moment the whole app is
 * built around, so it gets a held pause rather than a toast: the card rises
 * out of the bottom of the frame, turns over, lands with a shockwave, and
 * gets stamped.
 *
 * Rarer cards earn a longer hold and a louder burst — a mythic should not
 * flash past in the same 900ms as a common. That gradient is the reward
 * structure, expressed as time.
 *
 * Dismisses on tap, or on its own timer, then hands control back so the
 * caller can route to the card's detail screen.
 */
export function CollectCelebration({
  pin,
  onDone,
}: {
  pin: ArPin;
  onDone: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const rarity = pin.rarity;
  const meta = RARITY_META[rarity];
  const [burst, setBurst] = useState(0);

  const loud = rarity === "legendary" || rarity === "mythic";
  const hold = loud ? 3_400 : 2_500;

  useEffect(() => {
    if (reduceMotion) {
      onDone();
      return;
    }
    // Fire the burst on the frame the card lands, not on mount.
    const fire = setTimeout(() => setBurst((n) => n + 1), 620);
    const exit = setTimeout(onDone, hold);
    return () => {
      clearTimeout(fire);
      clearTimeout(exit);
    };
  }, [reduceMotion, onDone, hold]);

  if (reduceMotion) return null;

  return (
    <motion.div
      onClick={onDone}
      className="absolute inset-0 z-[80] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-ar-void/92 px-10 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* God rays, tinted to the rarity and turning slowly behind the card. */}
      <motion.div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[760px] w-[760px] opacity-45"
        // See the note in BootSequence: motion's inline transform replaces
        // Tailwind's `-translate-*`, so centring has to go through x/y.
        style={{
          x: "-50%",
          y: "-50%",
          background: `conic-gradient(from 0deg, transparent 0deg, hsl(${meta.hsl}/0.5) 12deg, transparent 26deg, transparent 44deg, hsl(${meta.hsl}/0.42) 58deg, transparent 72deg, transparent 96deg, hsl(${meta.hsl}/0.5) 110deg, transparent 126deg, transparent 156deg, hsl(${meta.hsl}/0.42) 170deg, transparent 186deg, transparent 216deg, hsl(${meta.hsl}/0.5) 230deg, transparent 246deg, transparent 280deg, hsl(${meta.hsl}/0.42) 294deg, transparent 310deg, transparent 340deg, hsl(${meta.hsl}/0.5) 352deg, transparent 360deg)`,
          maskImage:
            "radial-gradient(circle, transparent 12%, black 34%, transparent 74%)",
          WebkitMaskImage:
            "radial-gradient(circle, transparent 12%, black 34%, transparent 74%)",
        }}
        initial={{ rotate: 0, scale: 0.6, opacity: 0 }}
        animate={{ rotate: 360, scale: 1, opacity: 0.45 }}
        transition={{
          rotate: { duration: 26, repeat: Infinity, ease: "linear" },
          scale: { duration: 0.9, ease: "easeOut" },
          opacity: { duration: 0.7, delay: 0.3 },
        }}
      />

      {/* Landing shockwave */}
      <motion.span
        aria-hidden
        className="absolute left-1/2 top-1/2 h-48 w-48 rounded-full border-2"
        style={{ borderColor: `hsl(${meta.hsl})`, x: "-50%", y: "-50%" }}
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: [0.3, 3.4], opacity: [0, 0.85, 0] }}
        transition={{ duration: 1, delay: 0.58, ease: "easeOut" }}
      />

      {/* ── The card ──────────────────────────────────────────────────── */}
      <motion.div
        className="w-[58%] max-w-[230px] [perspective:1400px]"
        initial={{ y: 340, rotateY: 180, rotateZ: -18, scale: 0.7, opacity: 0 }}
        animate={{ y: 0, rotateY: 0, rotateZ: 0, scale: 1, opacity: 1 }}
        transition={{
          type: "spring",
          stiffness: 150,
          damping: 16,
          mass: 1.1,
          opacity: { duration: 0.2 },
        }}
      >
        <motion.div
          animate={{ y: [0, -9, 0] }}
          transition={{
            duration: 3.6,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.8,
          }}
        >
          <HoloCard pin={{ ...pin, collected: true }} interactive priority />
        </motion.div>
      </motion.div>

      {/* ── Stamp + copy ──────────────────────────────────────────────── */}
      <motion.div
        className="relative z-10 mt-7 flex flex-col items-center text-center"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.72, type: "spring", stiffness: 300, damping: 22 }}
      >
        <motion.span
          className="font-hud rounded-[9px] border-2 px-3.5 py-1 text-[13px] font-bold uppercase tracking-[0.3em]"
          style={{
            borderColor: `hsl(${meta.hsl})`,
            color: `hsl(${meta.hsl})`,
            boxShadow: `0 0 26px -4px hsl(${meta.hsl}/0.9), inset 0 0 18px -6px hsl(${meta.hsl}/0.9)`,
          }}
          initial={{ scale: 2.6, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: -3, opacity: 1 }}
          transition={{
            delay: 0.62,
            type: "spring",
            stiffness: 460,
            damping: 15,
          }}
        >
          Collected
        </motion.span>

        <h2 className="font-hud mt-4 max-w-[16rem] text-[19px] font-bold leading-tight text-ar-text">
          {pin.title}
        </h2>
        <p className="mt-1.5 text-[12.5px] text-ar-dim">
          {meta.label} &middot; {pin.brandName}
        </p>
        {loud && (
          <p
            className="font-hud mt-2 text-[10px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: `hsl(${meta.hsl})` }}
          >
            {meta.blurb}
          </p>
        )}
      </motion.div>

      <motion.p
        className="font-hud absolute bottom-[7%] text-[9.5px] uppercase tracking-[0.3em] text-ar-faint"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.8 }}
        transition={{ delay: 1.4 }}
      >
        Tap to continue
      </motion.p>

      <Confetti
        trigger={burst}
        rarity={rarity}
        count={loud ? 150 : 90}
        origin={{ x: 0.5, y: 0.46 }}
      />
    </motion.div>
  );
}
