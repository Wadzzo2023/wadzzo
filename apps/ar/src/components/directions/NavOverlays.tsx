import { LocateFixed, Menu, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { forwardRef, type ReactNode } from "react";

import { cn } from "@wadzzo/ui/lib/cn";
import { platformBranding } from "@wadzzo/platform/branding";

/**
 * ── Directions overlays ────────────────────────────────────────────────────
 *
 * Map buttons (compass, re-centre), the user arrow, and the "Compass HUD"
 * navigation style. Everything that moves per frame is positioned by
 * `useNavCamera` through refs — React only renders the static parts.
 */

/** Compass button: the needle points north; label says what a tap does. */
export const CompassButton = forwardRef<
  HTMLSpanElement,
  { onClick: () => void; northUp: boolean; className?: string }
>(function CompassButton({ onClick, northUp, className }, needleRef) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        northUp
          ? "Map faces north — tap to face your direction"
          : "Map faces your direction — tap for north up"
      }
      className={cn(
        "ar-glass text-ar-text relative flex h-11 w-11 items-center justify-center rounded-full shadow-lg",
        className,
      )}
    >
      <span ref={needleRef} className="relative block h-7 w-7 transition-none">
        <svg viewBox="0 0 28 28" className="h-full w-full" aria-hidden>
          <path d="M14 2 L18.5 14 L14 12.2 L9.5 14 Z" fill="#ef4444" />
          <path d="M14 26 L9.5 14 L14 15.8 L18.5 14 Z" fill="currentColor" opacity="0.55" />
          <text x="14" y="8.8" textAnchor="middle" fontSize="5.5" fontWeight="800" fill="#fff">
            N
          </text>
        </svg>
      </span>
      {northUp && (
        <span className="border-ar-bg bg-ar-green-hot absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2" />
      )}
    </button>
  );
});

export function MapIconButton({
  icon: Icon,
  label,
  onClick,
  active,
  className,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "ar-glass flex h-11 w-11 items-center justify-center rounded-full shadow-lg",
        active ? "text-ar-green-hot" : "text-ar-text",
        className,
      )}
    >
      <Icon size={19} strokeWidth={2.3} />
    </button>
  );
}

export function RecenterButton({
  onClick,
  className,
  label = "Re-centre",
}: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "ar-glass text-ar-text flex items-center gap-2 rounded-full px-4 py-2.5 shadow-lg",
        className,
      )}
    >
      <LocateFixed size={16} strokeWidth={2.4} className="text-ar-green-hot" />
      <span className="font-hud text-[11px] font-bold tracking-[0.14em] uppercase">{label}</span>
    </button>
  );
}

/** The navigating "you" arrow. Positioned + rotated per frame via ref. */
export const UserArrow = forwardRef<HTMLDivElement, { hud?: boolean }>(function UserArrow(
  { hud },
  ref,
) {
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute top-0 left-0 z-[5] will-change-transform"
      style={{ transform: "translate(-999px,-999px)" }}
    >
      {hud ? (
        <svg width="40" height="44" viewBox="0 0 40 44" aria-hidden>
          <path d="M20 3 L35 39 L20 31 L5 39 Z" fill="#f4f7f5" />
          <path d="M20 3 L20 31 L5 39 Z" fill="#c7d0cb" />
        </svg>
      ) : (
        <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden>
          <circle
            cx="23"
            cy="23"
            r="21"
            fill={platformBranding.colors.mapLoadingRoute}
            opacity="0.16"
          />
          <path
            d="M23 7 L35 36 L23 29 L11 36 Z"
            fill={platformBranding.colors.mapLoadingRoute}
            stroke="#fff"
            strokeWidth="2.8"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
});

const DIAL = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** The compass dial around you (HUD style). Rotated per frame so N is north. */
export const CompassDial = forwardRef<HTMLDivElement, { size: number }>(function CompassDial(
  { size },
  ref,
) {
  const r = size / 2;
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute top-0 left-0 z-[4] will-change-transform"
      style={{
        width: size,
        height: size,
        transform: "translate(-999px,-999px)",
      }}
    >
      <div className="absolute inset-0 rounded-full border border-white/12 bg-white/[0.035] backdrop-blur-[1px]" />
      {/* Ticks every 15°. */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        aria-hidden
      >
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i * 15 * Math.PI) / 180;
          const major = i % 6 === 0;
          const r1 = r - 4,
            r2 = r - (major ? 13 : 8);
          return (
            <line
              key={i}
              x1={r + Math.sin(a) * r1}
              y1={r - Math.cos(a) * r1}
              x2={r + Math.sin(a) * r2}
              y2={r - Math.cos(a) * r2}
              stroke={i === 0 ? "#ef4444" : "rgba(255,255,255,0.35)"}
              strokeWidth={major ? 2 : 1}
            />
          );
        })}
      </svg>
      {DIAL.map((d, i) => {
        const a = (i * 45 * Math.PI) / 180;
        const lr = r - 30;
        return (
          <span
            key={d}
            className={cn(
              "font-hud absolute -translate-x-1/2 -translate-y-1/2 font-bold",
              d.length === 1 ? "text-[15px] text-white/85" : "text-[10.5px] text-white/45",
              d === "N" && "text-[#ff6b6b]",
            )}
            style={{
              left: r + Math.sin(a) * lr,
              top: r - Math.cos(a) * lr,
              transform: `translate(-50%,-50%) rotate(${i * 45}deg)`,
            }}
          >
            {d}
          </span>
        );
      })}
    </div>
  );
});

/** One corner stat of the HUD. */
export function HudStat({
  value,
  unit,
  label,
  align = "left",
}: {
  value: ReactNode;
  unit?: string;
  label: string;
  align?: "left" | "right";
}) {
  return (
    <div className={cn("min-w-0", align === "right" && "text-right")}>
      <p className="font-hud text-[30px] leading-none font-bold whitespace-nowrap text-white tabular-nums">
        {value}
        {unit && <span className="ml-1 text-[15px] font-semibold text-white/70">{unit}</span>}
      </p>
      <p className="mt-1.5 text-[12px] text-white/55">{label}</p>
    </div>
  );
}

export function HudIconButton({
  icon,
  label,
  onClick,
}: {
  icon: "menu" | "style";
  label: string;
  onClick: () => void;
}) {
  const Icon = icon === "menu" ? Menu : SlidersHorizontal;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full text-white/80 active:bg-white/10"
    >
      <Icon size={24} strokeWidth={1.8} />
    </button>
  );
}
