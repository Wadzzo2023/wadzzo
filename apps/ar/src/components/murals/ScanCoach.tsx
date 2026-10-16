import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Footprints,
  Frame,
  Gauge,
  Hand,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { ArButton } from "~/components/ui/ArButton";
import type { SweepStep } from "~/lib/murals/useMuralSweep";

/**
 * ── Scan coach ─────────────────────────────────────────────────────────────
 *
 * Everything that teaches the scan after a mural locks (same as the mobile
 * app's ScanCoach):
 *
 *   SweepDemo   — an animated top-down drawing: you, your phone's view and
 *                 the wall: hold on the middle, turn left, then right, with
 *                 each photo spot lighting up as it's "taken".
 *   ScanCoach   — the "How to scan" dialog built around it. Opens by itself
 *                 the first time Murals is used, and from the ? button.
 *   TurnPrompt  — the live instruction during the scan: a big arrow with a
 *                 progress ring, and "other way" / "slow down" warnings.
 */

// ── First-run flag (per browser; a blocked storage just shows it again) ────

const SEEN_KEY = "wadzzo-mural-coach";
export function scanCoachSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
export function markScanCoachSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Storage blocked: it shows again next time, which is harmless.
  }
}

// ── SweepDemo ───────────────────────────────────────────────────────────────

const W = 280;
const H = 172;
/** Where you stand; the phone's view turns around this point. */
const PIVOT = { x: 140, y: 146 };
const WALL_Y = 26;
/** Angle from the pivot to each side photo spot on the wall (degrees). */
const TURN_DEG = 26;
const REACH = Math.tan((TURN_DEG * Math.PI) / 180) * (PIVOT.y - WALL_Y);
const SPOT_X = { left: PIVOT.x - REACH, centre: PIVOT.x, right: PIVOT.x + REACH };

const STAGES = [
  { label: "Point at the mural", angle: 0, ms: 1300 },
  { label: "Hold steady — photo 1", angle: 0, ms: 1100 },
  { label: "Turn left — photo 2", angle: -TURN_DEG, ms: 1700 },
  { label: "Then right — photo 3", angle: TURN_DEG, ms: 2200 },
] as const;

export function SweepDemo() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const stage = (reduce ? undefined : STAGES[i]) ?? STAGES[0];

  /** The phone has arrived for this stage (its photo spot lights then). */
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (reduce) return;
    const ms = STAGES[i]?.ms ?? 1000;
    const land = setTimeout(() => setLanded(true), ms * 0.6);
    const next = setTimeout(() => {
      setLanded(false);
      setI((n) => (n + 1) % STAGES.length);
    }, ms);
    return () => {
      clearTimeout(land);
      clearTimeout(next);
    };
  }, [i, reduce]);

  // Spots taken so far in this loop, in scan order: middle (stage 1), left
  // (2), right (3) — each once the phone has got there.
  const shot = (k: number) => reduce || i > k || (i === k && landed);
  const taken = { centre: shot(1), left: shot(2), right: shot(3) };

  return (
    <div className="relative mx-auto w-full max-w-[280px]" aria-hidden>
      <div className="relative" style={{ aspectRatio: `${W} / ${H}` }}>
        {/* The wall with its mural, the three photo spots, and you. */}
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="sweep-demo-mural" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#F472B6" />
              <stop offset="0.35" stopColor="hsl(var(--rarity-epic))" />
              <stop offset="0.65" stopColor="#35D7F2" />
              <stop offset="1" stopColor="#F5B70A" />
            </linearGradient>
          </defs>
          <rect
            x={12}
            y={WALL_Y - 14}
            width={W - 24}
            height={14}
            rx={3}
            fill="hsl(var(--ar-text) / 0.12)"
          />
          <rect
            x={SPOT_X.left - 22}
            y={WALL_Y - 12}
            width={SPOT_X.right - SPOT_X.left + 44}
            height={10}
            rx={2}
            fill="url(#sweep-demo-mural)"
            opacity={0.9}
          />
          {(["left", "centre", "right"] as const).map((k) => (
            <g key={k}>
              <circle
                cx={SPOT_X[k]}
                cy={WALL_Y + 10}
                r={8}
                fill={taken[k] ? "hsl(var(--rarity-epic))" : "transparent"}
                stroke={taken[k] ? "hsl(var(--rarity-epic))" : "hsl(var(--ar-text) / 0.45)"}
                strokeWidth={2}
              />
              {taken[k] && (
                <path
                  d={`M${SPOT_X[k] - 3.5} ${WALL_Y + 10} l2.5 2.5 l4.5 -5`}
                  stroke="#fff"
                  strokeWidth={2}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </g>
          ))}
          <ellipse
            cx={PIVOT.x}
            cy={PIVOT.y + 12}
            rx={22}
            ry={10}
            fill="hsl(var(--ar-text) / 0.18)"
          />
          <circle cx={PIVOT.x} cy={PIVOT.y + 8} r={9} fill="hsl(var(--ar-text) / 0.35)" />
          {/* Feet stay put. */}
          <path
            d={`M${PIVOT.x - 10} ${PIVOT.y + 26} h6 M${PIVOT.x + 4} ${PIVOT.y + 26} h6`}
            stroke="hsl(var(--ar-text) / 0.35)"
            strokeWidth={3}
            strokeLinecap="round"
          />
        </svg>

        {/* The phone and what it sees — this part turns. */}
        <motion.div
          className="absolute inset-0"
          style={{ transformOrigin: `${(PIVOT.x / W) * 100}% ${(PIVOT.y / H) * 100}%` }}
          animate={{ rotate: stage.angle }}
          transition={{ duration: (stage.ms * 0.55) / 1000, ease: "easeInOut" }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
            <path
              d={`M${PIVOT.x - 6} ${PIVOT.y - 10} L${PIVOT.x - 46} ${WALL_Y + 2} L${PIVOT.x + 46} ${WALL_Y + 2} L${PIVOT.x + 6} ${PIVOT.y - 10} Z`}
              fill="hsl(var(--rarity-epic))"
              opacity={0.18}
            />
            <path
              d={`M${PIVOT.x - 6} ${PIVOT.y - 10} L${PIVOT.x - 46} ${WALL_Y + 2} M${PIVOT.x + 6} ${PIVOT.y - 10} L${PIVOT.x + 46} ${WALL_Y + 2}`}
              stroke="hsl(var(--rarity-epic))"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              opacity={0.7}
            />
            <rect
              x={PIVOT.x - 12}
              y={PIVOT.y - 14}
              width={24}
              height={7}
              rx={2.5}
              fill="#fff"
              stroke="hsl(var(--rarity-epic))"
              strokeWidth={1.5}
            />
          </svg>
        </motion.div>
      </div>
      <p className="mt-2 text-center">
        <span className="font-hud bg-rarity-epic/20 text-rarity-epic inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-[0.14em] uppercase">
          {reduce ? "Middle · left · right" : stage.label}
        </span>
      </p>
    </div>
  );
}

// ── ScanCoach ───────────────────────────────────────────────────────────────

const STEPS: { Icon: LucideIcon; title: string; body: string }[] = [
  {
    Icon: Frame,
    title: "Point at the mural and hold",
    body: "Fill the frame with it. When the corners turn purple, hold steady — the first photo is taken in the middle.",
  },
  {
    Icon: ArrowLeft,
    title: "Turn a little left",
    body: "Like looking around, about a hand's width. The ring fills up and the second photo is taken.",
  },
  {
    Icon: ArrowRight,
    title: "Then turn right",
    body: "Across the middle to the right side. The last photo is taken there, then it's checked.",
  },
];
const TIPS: { Icon: LucideIcon; text: string }[] = [
  { Icon: Footprints, text: "Keep your feet still — turn the phone, don't walk." },
  { Icon: Gauge, text: "Go slowly, about 2 seconds each way." },
  { Icon: Frame, text: "Keep the mural in view the whole time." },
];

export function ScanCoach({
  open,
  onClose,
  manual,
}: {
  open: boolean;
  onClose: () => void;
  manual?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="absolute inset-0 z-[75] flex items-center justify-center px-4"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <motion.div
            aria-hidden
            onClick={onClose}
            className="bg-ar-void/80 absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="scan-coach-title"
            className="ar-scroll border-ar-line bg-ar-surface relative max-h-[calc(100%-24px)] w-full max-w-[400px] overflow-y-auto rounded-[28px] border p-5"
            initial={{ opacity: 0, scale: 0.92, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.16 } }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            <p className="font-hud text-ar-faint text-[9.5px] font-semibold tracking-[0.24em] uppercase">
              Murals
            </p>
            <h2
              id="scan-coach-title"
              className="font-hud text-ar-text mt-1 text-[21px] leading-7 font-bold"
            >
              How to scan a mural
            </h2>

            <div className="border-ar-line bg-ar-surface-2 mt-3.5 rounded-[18px] border px-3 py-3">
              <SweepDemo />
            </div>

            <ol className="mt-3.5 space-y-3">
              {STEPS.map(({ Icon, title, body }, n) => (
                <li key={title} className="flex gap-3">
                  <span className="font-hud border-rarity-epic/50 bg-rarity-epic/18 text-rarity-epic flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border text-[12px] font-bold">
                    {n + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-hud text-ar-text flex items-center gap-1.5 text-[12.5px] font-bold">
                      <Icon size={13} strokeWidth={2.4} />
                      {title}
                    </p>
                    <p className="text-ar-dim mt-0.5 text-[11.5px] leading-[17px]">{body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <ul className="bg-ar-surface-2 mt-3.5 space-y-2 rounded-[14px] p-3">
              {(manual
                ? [
                    {
                      Icon: Hand,
                      text: "No motion sensor here — drag sideways on the screen to turn.",
                    },
                    ...TIPS,
                  ]
                : TIPS
              ).map(({ Icon, text }) => (
                <li
                  key={text}
                  className="text-ar-dim flex items-center gap-2 text-[11.5px] leading-4"
                >
                  <Icon size={14} strokeWidth={2.3} className="text-gold shrink-0" />
                  {text}
                </li>
              ))}
            </ul>

            <ArButton
              variant="primary"
              size="lg"
              block
              icon={Check}
              className="mt-4"
              onClick={onClose}
            >
              Got it
            </ArButton>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── TurnPrompt ──────────────────────────────────────────────────────────────

const RING = 58;
const RING_R = 25;
const RING_C = 2 * Math.PI * RING_R;

/**
 * The live instruction during the scan: which way, and how far (the ring
 * fills as you get there). The SweepGauge under it shows where you are and
 * the three photo spots.
 */
export function TurnPrompt({
  step,
  progress,
  wrongWay,
  tooFast,
  manual,
}: {
  step: SweepStep;
  progress: number;
  wrongWay: boolean;
  tooFast: boolean;
  /** No motion sensor: turning is done by dragging. */
  manual?: boolean;
}) {
  const warn = wrongWay || tooFast;
  const holding = step === "centre" || (step === "right" && progress >= 1);
  const Icon =
    step === "left"
      ? ArrowLeft
      : step === "right" && !holding
        ? ArrowRight
        : step === "done"
          ? Check
          : Hand;
  const title =
    step === "done"
      ? "Got it"
      : tooFast
        ? "Slow down"
        : wrongWay
          ? "Other way"
          : holding
            ? "Hold steady"
            : step === "left"
              ? "Now turn left"
              : "Now turn right";
  const turnWord = manual ? "Drag" : "Turn the phone";
  const sub =
    step === "done"
      ? "Checking your photos…"
      : tooFast
        ? "Turn gently — about 2 seconds each way."
        : step === "centre"
          ? "Keep the mural in the middle — photo 1 of 3."
          : holding
            ? "Right there — taking photo 3 of 3."
            : wrongWay
              ? `${turnWord} to your ${step === "left" ? "left" : "right"}.`
              : step === "left"
                ? manual
                  ? "Drag sideways to the left — photo 2 of 3."
                  : "A little, like looking around — photo 2 of 3."
                : manual
                  ? "Drag back across to the right — photo 3 of 3."
                  : "Across the middle to the right — photo 3 of 3.";
  const filled = Math.max(0.02, Math.min(1, progress));
  const accent = warn ? "hsl(var(--gold))" : "hsl(var(--rarity-epic))";

  return (
    <div className="flex items-center justify-center gap-3.5 text-left">
      <span
        className="relative flex shrink-0 items-center justify-center"
        style={{ width: RING, height: RING }}
      >
        <svg width={RING} height={RING} className="absolute inset-0 -rotate-90">
          <circle
            cx={RING / 2}
            cy={RING / 2}
            r={RING_R}
            stroke="hsl(var(--ar-text) / 0.15)"
            strokeWidth={4}
            fill="none"
          />
          <circle
            cx={RING / 2}
            cy={RING / 2}
            r={RING_R}
            stroke={accent}
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${RING_C * filled} ${RING_C}`}
            style={{ transition: "stroke-dasharray 120ms linear" }}
          />
        </svg>
        <Icon size={24} strokeWidth={2.6} style={{ color: accent }} />
      </span>
      <div className="max-w-[13rem] min-w-0">
        <p
          className="font-hud text-[17px] font-bold tracking-[0.08em] uppercase"
          style={{ color: warn ? accent : undefined }}
          aria-live="polite"
        >
          {title}
        </p>
        <p className="text-ar-dim mt-0.5 text-[11.5px] leading-4">{sub}</p>
      </div>
    </div>
  );
}
