import { Image as ImageIcon, Lock, QrCode, Satellite } from "lucide-react";
import { type ReactNode } from "react";

import { RARITY_META, STATUS_META } from "~/lib/ar/rarity";
import type { DetectionMethod, PinStatus, Rarity } from "~/lib/ar/types";
import { cn } from "~/lib/utils";

/**
 * Rarity plate — the small hard-edged tag in the corner of every card.
 * Mythic is the only one that gets a moving gradient; if everything shimmers,
 * nothing does.
 */
export function RarityPlate({
  rarity,
  size = "md",
  showLabel = true,
}: {
  rarity: Rarity;
  size?: "sm" | "md";
  showLabel?: boolean;
}) {
  const meta = RARITY_META[rarity];
  const mythic = rarity === "mythic";

  return (
    <span
      className={cn(
        "font-hud inline-flex items-center gap-1 rounded-[6px] border font-bold uppercase leading-none tracking-[0.12em]",
        size === "sm" ? "h-[18px] px-1.5 text-[8.5px]" : "h-[22px] px-2 text-[10px]",
        mythic && "animate-gradient-x bg-[length:200%_200%]",
      )}
      style={{
        borderColor: `hsl(${meta.hsl} / 0.55)`,
        color: mythic ? "hsl(0 0% 100%)" : `hsl(${meta.hsl})`,
        background: mythic
          ? "linear-gradient(90deg,hsl(var(--rarity-mythic)/0.85),hsl(var(--rarity-legendary)/0.85),hsl(var(--rarity-rare)/0.85),hsl(var(--rarity-mythic)/0.85))"
          : `hsl(${meta.hsl} / 0.14)`,
        boxShadow: `0 0 14px -4px hsl(${meta.hsl} / 0.8)`,
      }}
    >
      <span>{meta.short}</span>
      {showLabel && <span className="tracking-[0.1em]">{meta.label}</span>}
    </span>
  );
}

const TONE: Record<string, string> = {
  green: "border-ar-green/50 bg-ar-green/14 text-ar-green-hot",
  gold: "border-rarity-legendary/50 bg-rarity-legendary/14 text-rarity-legendary",
  danger: "border-ar-danger/50 bg-ar-danger/14 text-ar-danger",
  muted: "border-ar-line-bright bg-white/[0.05] text-ar-faint",
};

export function StatusBadge({
  status,
  className,
}: {
  status: PinStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "font-hud inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
        TONE[meta.tone],
        className,
      )}
    >
      {status === "collectible" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-pulse-ring absolute inset-0 rounded-full bg-ar-green-hot" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-ar-green-hot" />
        </span>
      )}
      {status === "locked" && <Lock size={10} strokeWidth={2.6} />}
      {meta.label}
    </span>
  );
}

const DETECTION_META: Record<
  DetectionMethod,
  { label: string; icon: typeof QrCode; hint: string }
> = {
  gps: {
    label: "GPS",
    icon: Satellite,
    hint: "Unlocks when you're inside the radius. Best in open outdoor space.",
  },
  qr: {
    label: "QR",
    icon: QrCode,
    hint: "Scan the code on the sign. Works indoors, no location permission needed.",
  },
  image: {
    label: "Scan",
    icon: ImageIcon,
    hint: "Point your camera at the object itself — no sign to find.",
  },
};

export { DETECTION_META };

export function DetectionBadge({
  method,
  className,
}: {
  method: DetectionMethod;
  className?: string;
}) {
  const meta = DETECTION_META[method];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "font-hud inline-flex h-[22px] items-center gap-1.5 rounded-full border border-ar-line-bright bg-white/[0.05] px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ar-dim",
        className,
      )}
    >
      <Icon size={11} strokeWidth={2.4} />
      {meta.label}
    </span>
  );
}

/** Generic pill for categories, filters, and brand tags. */
export function Chip({
  children,
  active,
  onClick,
  className,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={cn(
        "font-hud inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors",
        active
          ? "border-ar-green/60 bg-ar-green/15 text-ar-green-hot shadow-[0_0_16px_-6px_hsl(var(--ar-green)/0.9)]"
          : "border-ar-line bg-white/[0.04] text-ar-dim hover:text-ar-text",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Label + number, used across profile, brand, and collection headers. */
export function StatBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={cn(
          "font-hud text-[19px] font-bold leading-none tabular-nums",
          accent ? "text-ar-green-hot text-glow-soft" : "text-ar-text",
        )}
      >
        {value}
      </span>
      <span className="font-hud text-[9px] font-semibold uppercase tracking-[0.18em] text-ar-faint">
        {label}
      </span>
    </div>
  );
}
