import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import { WadzzoMark } from "~/components/brand/WadzzoMark";
import { RARITY_META } from "~/lib/ar/rarity";
import type { Rarity } from "~/lib/ar/types";
import { cn } from "~/lib/utils";

/**
 * ── PackOpening ────────────────────────────────────────────────────────────
 *
 * A sealed foil pack that has to be torn open before the card underneath is
 * revealed — the trading-card ritual, not just a fade-in.
 *
 * The point is deferral. A card that's simply *there* when the page loads is
 * information; a card you had to open is a pull. That one tap is what makes
 * a rarity worth reacting to, and it costs nothing but a moment — so the
 * pack is dismissed permanently for a given card once opened (see
 * `openedKey`), because the ritual is only good the first time and becomes an
 * obstacle on every visit after.
 *
 * Sequencing is four beats, each with a job:
 *   1. `sealed`    — the pack sits still, inviting the tap.
 *   2. `stripping` — the tear-strip peels off the top edge and flies away.
 *                    This is the gacha beat: the moment of commitment, before
 *                    anything is revealed.
 *   3. `tearing`   — the foil splits along the seam and the halves fall away,
 *                    with a burst of the card's own rarity colour behind them.
 *                    The card is already mounted underneath, scaling up.
 *   4. `open`      — the pack is gone and unmounted entirely.
 *
 * Under `prefers-reduced-motion` the whole thing degrades to a plain
 * cross-fade with no flying geometry: the tap and the reveal both still
 * happen, they just don't move. Someone who gets motion sick shouldn't have
 * to choose between that and never seeing their own card.
 */

type Phase = "sealed" | "stripping" | "tearing" | "open";

/**
 * The gacha beat: the tear-strip peels off the top first, *then* the foil
 * splits. Two separate motions rather than one, because that's the bit that
 * reads as opening a real pack — the strip is the commitment, the split is
 * the payoff. Collapsed into a single fade under reduced motion.
 */
const STRIP_MS = 460;
const TEAR_MS = 780;
const REDUCED_MS = 260;

export function PackOpening({
  rarity,
  /**
   * Stable id for "this pack has already been opened". Persisted to
   * `sessionStorage` so revisiting a card in the same session doesn't replay
   * the ritual, while a fresh session gets it back.
   *
   * Omit to always show the pack — used by the capture celebration, where
   * the opening *is* the moment and should never be skipped.
   */
  openedKey,
  children,
  className,
}: {
  rarity: Rarity;
  openedKey?: string;
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const meta = RARITY_META[rarity];

  // Starts `open` when this pack was already torn earlier in the session, so
  // there's no flash of a sealed pack before it dismisses itself.
  const [phase, setPhase] = useState<Phase>(() => {
    if (!openedKey) return "sealed";
    if (typeof window === "undefined") return "sealed";
    try {
      return window.sessionStorage.getItem(packStorageKey(openedKey))
        ? "open"
        : "sealed";
    } catch {
      // Private browsing / storage disabled — just show the pack.
      return "sealed";
    }
  });

  const open = useCallback(() => {
    if (phase !== "sealed") return;
    setPhase("stripping");
    if (openedKey) {
      try {
        window.sessionStorage.setItem(packStorageKey(openedKey), "1");
      } catch {
        // Not being able to remember costs a replayed animation, nothing more.
      }
    }
  }, [phase, openedKey]);

  // Strip peels, then the foil splits, then the pack unmounts. Under reduced
  // motion the two beats collapse into one short fade.
  useEffect(() => {
    if (phase === "stripping") {
      const id = setTimeout(
        () => setPhase("tearing"),
        reduced ? 0 : STRIP_MS,
      );
      return () => clearTimeout(id);
    }
    if (phase === "tearing") {
      const id = setTimeout(
        () => setPhase("open"),
        reduced ? REDUCED_MS : TEAR_MS,
      );
      return () => clearTimeout(id);
    }
  }, [phase, reduced]);

  const tearing = phase === "tearing";

  return (
    <div className={cn("relative", className)}>
      {/* The card. Mounted from the start — it has to be loading its art
          while the pack is still sealed, or the reveal would land on an
          empty frame and the whole beat would be wasted waiting. */}
      <motion.div
        initial={false}
        animate={
          phase === "sealed" || phase === "stripping"
            ? { scale: 0.92, opacity: 0 }
            : { scale: 1, opacity: 1 }
        }
        transition={
          reduced
            ? { duration: 0.2 }
            : { type: "spring", stiffness: 220, damping: 22, delay: 0.12 }
        }
      >
        {children}
      </motion.div>

      <AnimatePresence>
        {phase !== "open" && (
          <motion.div
            key="pack"
            className="absolute inset-0 z-20"
            initial={false}
            exit={{ opacity: 0 }}
          >
            {/* Rarity burst — sits behind the foil halves so it reads as
                light escaping the pack as it splits, not as a flash pasted
                on top of it. */}
            <AnimatePresence>
              {tearing && !reduced && (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-1/2 -z-10 block rounded-full"
                  style={{
                    background: `radial-gradient(circle, hsl(${meta.hsl}/0.85), hsl(${meta.hsl}/0.25) 45%, transparent 70%)`,
                  }}
                  initial={{ width: 40, height: 40, x: "-50%", y: "-50%", opacity: 0 }}
                  animate={{
                    width: 560,
                    height: 560,
                    x: "-50%",
                    y: "-50%",
                    opacity: [0, 1, 0],
                  }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                />
              )}
            </AnimatePresence>

            {/* Tear strip along the top edge — the bit you actually pull.
                Rides above the halves so it reads as a separate layer of
                foil, and leaves a torn edge behind it when it goes. */}
            <motion.div
              aria-hidden
              className="absolute inset-x-0 top-0 z-[15] origin-left overflow-hidden rounded-t-[14px]"
              style={{ height: "11%" }}
              initial={false}
              animate={
                phase === "sealed"
                  ? { x: 0, rotate: 0, opacity: 1 }
                  : reduced
                    ? { opacity: 0 }
                    : { x: "108%", rotate: 7, opacity: 0 }
              }
              transition={
                reduced
                  ? { duration: REDUCED_MS / 1000 }
                  : { duration: STRIP_MS / 1000, ease: [0.4, 0, 0.3, 1] }
              }
            >
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(180deg, hsl(${meta.hsl}/0.55), hsl(var(--ar-void)))`,
                  boxShadow: `inset 0 -1px 0 hsl(${meta.hsl}/0.7)`,
                }}
              />
              {/* Perforation dots along the tear line. */}
              <div
                className="absolute inset-x-0 bottom-0 h-[2px]"
                style={{
                  backgroundImage: `repeating-linear-gradient(90deg, hsl(${meta.hsl}/0.9) 0 3px, transparent 3px 7px)`,
                }}
              />
              <span className="font-hud absolute inset-0 flex items-center justify-center text-[7px] font-bold uppercase tracking-[0.3em] text-white/45">
                Pull
              </span>
            </motion.div>

            {/* Two foil halves. Sealed, they meet at the centre seam and read
                as one pack; torn, each rotates away from that seam. */}
            <PackHalf
              side="left"
              rarity={rarity}
              tearing={tearing}
              reduced={reduced}
              onOpen={open}
            />
            <PackHalf
              side="right"
              rarity={rarity}
              tearing={tearing}
              reduced={reduced}
              onOpen={open}
            />

            {/* Prompt. Lives above both halves so it isn't clipped by either
                one's overflow, and disappears the instant the tear starts. */}
            <AnimatePresence>
              {phase === "sealed" && (
                <motion.button
                  type="button"
                  onClick={open}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.18 }}
                  className="absolute inset-0 z-10 flex cursor-pointer flex-col items-center justify-center gap-3 focus-visible:outline-none"
                  aria-label="Tear open the pack to reveal your card"
                >
                  <WadzzoMark glow className="h-10 w-auto" />

                  <motion.span
                    className="font-hud flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{
                      color: `hsl(${meta.hsl})`,
                      borderColor: `hsl(${meta.hsl}/0.5)`,
                      background: `hsl(${meta.hsl}/0.12)`,
                    }}
                    animate={reduced ? undefined : { scale: [1, 1.05, 1] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Sparkles size={11} strokeWidth={2.6} />
                    Tap to open
                  </motion.span>
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * One half of the foil wrapper.
 *
 * Each half is a full-size pack face clipped to its own side, so the artwork
 * (foil sheen, seam, texture) is authored once at full width and simply
 * revealed in two pieces — rather than two separate half-drawings that would
 * have to be kept in sync to look like one object when closed.
 */
function PackHalf({
  side,
  rarity,
  tearing,
  reduced,
  onOpen,
}: {
  side: "left" | "right";
  rarity: Rarity;
  tearing: boolean;
  reduced: boolean;
  onOpen: () => void;
}) {
  const meta = RARITY_META[rarity];
  const isLeft = side === "left";

  return (
    <motion.div
      aria-hidden
      onClick={onOpen}
      className="absolute inset-0 overflow-hidden rounded-[14px]"
      style={{
        // Each half shows only its own side of the full-width artwork.
        clipPath: isLeft ? "inset(0 50% 0 0)" : "inset(0 0 0 50%)",
        transformOrigin: isLeft ? "left center" : "right center",
      }}
      initial={false}
      animate={
        tearing
          ? reduced
            ? { opacity: 0 }
            : {
                x: isLeft ? "-62%" : "62%",
                rotate: isLeft ? -14 : 14,
                opacity: 0,
              }
          : { x: 0, rotate: 0, opacity: 1 }
      }
      transition={
        reduced
          ? { duration: REDUCED_MS / 1000 }
          : { duration: TEAR_MS / 1000, ease: [0.3, 0, 0.2, 1] }
      }
    >
      {/* Foil body */}
      <div
        className="absolute inset-0 rounded-[14px]"
        style={{
          background: `
            linear-gradient(145deg,
              hsl(${meta.hsl}/0.45) 0%,
              hsl(var(--ar-surface)) 28%,
              hsl(var(--ar-void)) 55%,
              hsl(${meta.hsl}/0.35) 100%)`,
          boxShadow: `inset 0 0 0 1.5px hsl(${meta.hsl}/0.55), 0 12px 32px -14px rgba(0,0,0,0.95)`,
        }}
      />

      {/* Diagonal foil sheen, and the app's own grid so the pack reads as
          part of this product rather than generic shiny plastic. */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background: `repeating-linear-gradient(115deg,
            transparent 0 14px,
            hsl(0 0% 100%/0.06) 14px 16px,
            transparent 16px 30px)`,
        }}
      />
      <div className="ar-grid absolute inset-0 opacity-20" />

      {/* Centre seam — the line the two halves separate along. Drawn on the
          inner edge of each half so together they form one crisp seam. */}
      <div
        className={cn("absolute inset-y-0 w-px", isLeft ? "right-0" : "left-0")}
        style={{ background: `hsl(${meta.hsl}/0.7)` }}
      />
    </motion.div>
  );
}

const packStorageKey = (key: string) => `wadzzo-pack-opened:${key}`;
