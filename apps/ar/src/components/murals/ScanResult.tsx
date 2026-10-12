import { animate, motion, useReducedMotion } from "framer-motion";
import {
  Coins,
  MapPinOff,
  MonitorX,
  PencilLine,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Confetti } from "~/components/fx/Confetti";
import { ArButton } from "~/components/ui/ArButton";
import type { RejectCode, ScanResult as Result } from "~/lib/murals/constants";
import { cn } from "@wadzzo/ui/lib/cn";
import { platformBranding } from "@wadzzo/platform/branding";

/**
 * ── ScanResult ─────────────────────────────────────────────────────────────
 *
 * What a finished scan turns into (plan §6.7). Three shapes:
 *
 *   collected   a known mural — coins tick up, today's scans shown as dots
 *   discovered  one of the first finders — the big moment: confetti, the
 *               bonus called out separately, the confirmations so far, and
 *               (if nobody has yet) the way into naming it
 *   rejected    the specific reason and the specific next step
 *
 * The photo on the card is the person's own centre keyframe — never anyone
 * else's (plan §12.6).
 */

const REJECT_ICON: Partial<Record<RejectCode, LucideIcon>> = {
  SCREEN: MonitorX,
  WEB_COPY: MonitorX,
  GPS_WEAK: MapPinOff,
  UNSAFE: ShieldAlert,
  MURAL_REJECTED: ShieldAlert,
};

function CountUp({ to }: { to: number }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) return setV(to);
    const c = animate(0, to, {
      duration: 0.9,
      ease: "easeOut",
      onUpdate: (x) => setV(Math.round(x)),
    });
    return () => c.stop();
  }, [to, reduce]);
  return <>{v.toLocaleString()}</>;
}

function Dots({ filled, total, className }: { filled: number; total: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-1", className)} aria-label={`${filled} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-2 w-2 rounded-full",
            i < filled
              ? "bg-rarity-epic shadow-[0_0_6px_hsl(var(--rarity-epic)/0.8)]"
              : "bg-white/20",
          )}
        />
      ))}
    </span>
  );
}

function MuralPhoto({ src, verified }: { src: string; verified: boolean }) {
  return (
    <motion.div
      initial={{ scale: 0.85, rotate: -3, opacity: 0 }}
      animate={{ scale: 1, rotate: -2, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      className="border-rarity-epic/80 relative mx-auto h-[132px] w-[106px] rounded-[14px] border-2 p-[3px] shadow-[0_10px_30px_-8px_hsl(var(--rarity-epic)/0.7)]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
      <img src={src} alt="" className="h-full w-full rounded-[10px] object-cover" />
      <span
        className={cn(
          "font-hud absolute -bottom-2.5 left-1/2 -translate-x-1/2 rounded-full border px-2 py-[2px] text-[8.5px] font-bold tracking-[0.14em] whitespace-nowrap uppercase",
          verified
            ? "border-ar-green/60 bg-ar-void text-ar-green-hot"
            : "bg-ar-void text-ar-dim border-white/30",
        )}
      >
        {verified ? "Verified" : "Unverified"}
      </span>
    </motion.div>
  );
}

export function ScanResult({
  result,
  photo,
  onDone,
  onRetry,
  onName,
}: {
  result: Result;
  /** The person's own centre keyframe (object URL). */
  photo: string | null;
  onDone: () => void;
  onRetry: () => void;
  onName: () => void;
}) {
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (result.kind === "discovered") setBurst((n) => n + 1);
  }, [result]);

  if (result.kind === "rejected") {
    const Icon = REJECT_ICON[result.code] ?? TriangleAlert;
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="ar-glass rounded-ar-lg mx-auto w-full max-w-[19rem] p-6 text-center"
        role="alert"
      >
        <span className="border-ar-danger/60 bg-ar-danger/15 text-ar-danger mx-auto flex h-12 w-12 items-center justify-center rounded-full border">
          <Icon size={22} strokeWidth={2.3} />
        </span>
        <p className="font-hud text-ar-text mt-3 text-[13px] font-bold tracking-[0.12em] uppercase">
          Couldn&apos;t collect
        </p>
        <p className="text-ar-dim mx-auto mt-1.5 max-w-[15rem] text-[12px] leading-relaxed">
          {result.message}
        </p>
        <div className="mt-4 space-y-2">
          {result.retryable && (
            <ArButton variant="primary" size="md" block icon={RotateCcw} onClick={onRetry}>
              Try again
            </ArButton>
          )}
          <ArButton
            variant={result.retryable ? "ghost" : "primary"}
            size="md"
            block
            onClick={onDone}
          >
            Done
          </ArButton>
        </div>
      </motion.div>
    );
  }

  const { mural } = result;
  const verified = mural.status === "APPROVED";
  const discovered = result.kind === "discovered";
  const first = discovered && result.rank === 1;
  const total = result.coins + (discovered ? result.bonus : 0);

  return (
    <>
      <Confetti trigger={burst} rarity="epic" origin={{ x: 0.5, y: 0.3 }} count={110} />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="ar-glass rounded-ar-lg relative mx-auto w-full max-w-[19.5rem] px-5 pt-6 pb-5 text-center"
        role="status"
      >
        {discovered && (
          <span className="font-hud border-rarity-epic/70 bg-ar-void text-rarity-epic absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border px-2.5 py-1 text-[9.5px] font-bold tracking-[0.16em] whitespace-nowrap uppercase">
            <Sparkles size={11} strokeWidth={2.6} />
            {first ? "Discoverer" : `Finder #${result.rank}`}
          </span>
        )}

        {photo && <MuralPhoto src={photo} verified={verified} />}

        <p className="font-hud text-ar-text mt-5 text-[15px] leading-tight font-bold">
          {discovered
            ? first
              ? "You discovered a new mural!"
              : "You helped verify this mural!"
            : mural.title}
        </p>
        {discovered && <p className="text-ar-dim mt-1 text-[12px]">{mural.title}</p>}

        {/* Coins */}
        <div className="rounded-ar border-gold/35 bg-gold/10 mt-4 border px-4 py-3">
          <p className="font-hud text-gold flex items-center justify-center gap-1.5 text-[26px] leading-none font-bold">
            <Coins size={22} strokeWidth={2.4} />+<CountUp to={total} />
          </p>
          {discovered && (
            <p className="text-ar-dim mt-1.5 text-[11px]">
              {result.coins} scan ·{" "}
              <span className="text-gold font-semibold">{result.bonus} discovery bonus</span>
            </p>
          )}
          <p className="text-ar-faint mt-1 text-[10.5px] tracking-[0.12em] uppercase">
            {platformBranding.coinName} · balance {result.balance.toLocaleString()}
          </p>
        </div>

        {/* Progress */}
        <div className="text-ar-dim mt-3 space-y-1.5 text-[11.5px]">
          {discovered && mural.status !== "APPROVED" && (
            <p className="flex items-center justify-center gap-2">
              <Dots
                filled={Math.min(mural.distinctScanners, mural.confirmationsNeeded)}
                total={mural.confirmationsNeeded}
              />
              {mural.distinctScanners >= mural.confirmationsNeeded
                ? "Sent for review"
                : `${mural.distinctScanners} of ${mural.confirmationsNeeded} finders`}
            </p>
          )}
          <p className="flex items-center justify-center gap-2">
            <Dots filled={result.scansToday} total={result.dailyLimit} />
            Scans today {result.scansToday}/{result.dailyLimit}
          </p>
        </div>

        <div className="mt-4 space-y-2">
          {discovered && result.canName ? (
            <>
              <ArButton variant="primary" size="md" block icon={PencilLine} onClick={onName}>
                Name this mural
              </ArButton>
              <ArButton variant="ghost" size="md" block onClick={onDone}>
                Skip
              </ArButton>
            </>
          ) : (
            <>
              <ArButton variant="primary" size="md" block onClick={onDone}>
                Done
              </ArButton>
              <ArButton variant="ghost" size="sm" block onClick={onRetry}>
                Scan another
              </ArButton>
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}
