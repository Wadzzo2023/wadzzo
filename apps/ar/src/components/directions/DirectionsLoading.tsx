import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";

import { Skeleton } from "~/components/ui/Skeleton";
import { platformBranding } from "@wadzzo/platform/branding";

const LINES = ["Finding the drop…", "Plotting your route…", "Checking every way there…"];

/**
 * ── DirectionsLoading ──────────────────────────────────────────────────────
 *
 * Shown while the Directions target (drop or mural) loads. Same layout as the
 * real preview — map area, back button, map buttons, bottom sheet — so nothing
 * jumps when it arrives. A route draws itself from "you" to a flag on a faint
 * street grid, under a status line that cycles.
 */
export function DirectionsLoading({ onBack, mural }: { onBack: () => void; mural?: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % LINES.length), 1600);
    return () => clearInterval(t);
  }, []);
  const lines = mural ? ["Finding the mural…", ...LINES.slice(1)] : LINES;

  return (
    <div className="relative h-full overflow-hidden bg-ar-bg" role="status" aria-live="polite" aria-label="Loading directions">
      {/* Map stand-in: street grid + a route drawing itself. */}
      <div className="absolute inset-0">
        <div className="ar-grid absolute inset-0 opacity-60" />
        <svg viewBox="0 0 360 520" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
          <g stroke="hsl(var(--ar-line))" strokeWidth="10" strokeLinecap="round" fill="none" opacity="0.55">
            <path d="M-20 360 L380 300" />
            <path d="M70 -20 L120 560" />
            <path d="M-20 150 L380 190" />
            <path d="M250 -20 L230 560" />
          </g>
          <path d="M98 296 L114 238 L122 176 L236 164 L244 104" fill="none" stroke={platformBranding.colors.mapLoadingRoute} strokeOpacity="0.18" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
          <path
            className="dir-load-route"
            d="M98 296 L114 238 L122 176 L236 164 L244 104"
            fill="none"
            stroke={platformBranding.colors.mapLoadingRoute}
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={100}
          />
          {/* You */}
          <circle cx="98" cy="296" r="18" fill={platformBranding.colors.mapLoadingRoute} opacity="0.18" className="dir-load-pulse" />
          <circle cx="98" cy="296" r="8" fill={platformBranding.colors.mapLoadingRoute} stroke="#fff" strokeWidth="3" />
          {/* Destination */}
          <g className="dir-load-flag">
            <path d="M244 104 L244 70" stroke="hsl(var(--rarity-epic))" strokeWidth="3" strokeLinecap="round" />
            <rect x="226" y="40" width="36" height="36" rx="11" fill="hsl(var(--ar-surface))" stroke="hsl(var(--rarity-epic))" strokeWidth="3" />
            <path d="M237 66 L237 50 L251 54 L237 59" fill="hsl(var(--rarity-epic))" />
          </g>
        </svg>
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_40%,transparent_45%,hsl(var(--ar-bg))_100%)]" />
      </div>

      <button
        onClick={onBack}
        aria-label="Back"
        className="ar-glass absolute left-4 z-10 flex h-10 items-center gap-1 rounded-full pl-2 pr-3.5 text-ar-text"
        style={{ top: "calc(var(--ar-top-inset) + 12px)" }}
      >
        <ChevronLeft size={18} strokeWidth={2.4} />
        <span className="font-hud text-[10.5px] font-semibold uppercase tracking-[0.14em]">Back</span>
      </button>
      <div className="absolute right-3 z-10 flex flex-col gap-2.5" style={{ top: "calc(var(--ar-top-inset) + 12px)" }}>
        <Skeleton rounded="rounded-full" className="h-11 w-11" />
        <Skeleton rounded="rounded-full" className="h-11 w-11" />
      </div>

      {/* Status line */}
      <div className="absolute inset-x-0 z-10 flex justify-center" style={{ bottom: 214 }}>
        <span key={i} className="dir-load-line font-hud rounded-full bg-ar-surface/90 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ar-green-hot shadow-lg">
          {lines[i]}
        </span>
      </div>

      {/* Sheet skeleton — same shape as the real one. */}
      <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-[24px] border-t border-ar-line bg-ar-bg px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2.5 shadow-[0_-12px_32px_-14px_rgba(0,0,0,0.55)]">
        <div className="mx-auto mb-2.5 h-1.5 w-11 rounded-full bg-ar-line-bright/70" />
        <div className="flex items-center gap-3">
          <Skeleton rounded="rounded-[12px]" className="h-12 w-12 shrink-0" />
          <div className="flex-1">
            <Skeleton rounded="rounded-full" className="h-4 w-40" />
            <Skeleton rounded="rounded-full" className="mt-2 h-3 w-28" />
          </div>
        </div>
        <div className="mt-3 flex gap-1.5">
          {[0, 1, 2, 3].map((k) => (
            <Skeleton key={k} rounded="rounded-full" className="h-9 flex-1" />
          ))}
        </div>
        <div className="mt-3 flex items-end gap-3">
          <div className="flex-1">
            <Skeleton rounded="rounded-full" className="h-6 w-32" />
            <Skeleton rounded="rounded-full" className="mt-2 h-3 w-48" />
          </div>
          <Skeleton rounded="rounded-[14px]" className="h-12 w-28" />
        </div>
      </div>

      <style jsx>{`
        .dir-load-route {
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          animation: dir-draw 2.2s cubic-bezier(0.6, 0, 0.3, 1) infinite;
        }
        .dir-load-pulse {
          transform-origin: 98px 296px;
          animation: dir-pulse 1.6s ease-out infinite;
        }
        .dir-load-flag {
          transform-origin: 244px 104px;
          animation: dir-flag 2.2s ease-in-out infinite;
        }
        .dir-load-line {
          animation: dir-fade 0.35s ease-out;
        }
        @keyframes dir-draw {
          0% { stroke-dashoffset: 100; opacity: 1; }
          70% { stroke-dashoffset: 0; opacity: 1; }
          90%, 100% { stroke-dashoffset: 0; opacity: 0; }
        }
        @keyframes dir-pulse {
          0% { transform: scale(0.6); opacity: 0.5; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes dir-flag {
          0%, 55% { transform: translateY(0) scale(1); }
          70% { transform: translateY(-6px) scale(1.08); }
          85%, 100% { transform: translateY(0) scale(1); }
        }
        @keyframes dir-fade {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dir-load-route, .dir-load-pulse, .dir-load-flag, .dir-load-line { animation: none; stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}
