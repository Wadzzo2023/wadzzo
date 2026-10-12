import { useId } from "react";
import { platformBranding } from "@wadzzo/platform/branding";

/**
 * ── PackArt ────────────────────────────────────────────────────────────────
 *
 * The "Mural Pack" emblem — a game-DLC style badge: a hex plate in the
 * murals' epic purple, a picture frame with a paint drip and a spray can
 * inside, sparkles, and a progress ring around it all. Pure SVG (generated
 * for this feature), so it's crisp at any size and needs no asset files.
 *
 * `progress` 0–1 fills the ring; `done` swaps the ring for a solid glow.
 */
export function PackArt({
  size = 96,
  progress = 0,
  done = false,
  spinning = false,
}: {
  size?: number;
  progress?: number;
  done?: boolean;
  spinning?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const R = 46;
  const C = 2 * Math.PI * R;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      className="shrink-0 overflow-visible"
    >
      <defs>
        <linearGradient id={`plate-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="hsl(272 82% 62%)" />
          <stop offset="1" stopColor="hsl(300 70% 38%)" />
        </linearGradient>
        <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="hsl(190 95% 60%)" />
          <stop offset="1" stopColor="hsl(272 90% 70%)" />
        </linearGradient>
        <linearGradient id={`can-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#e9d5ff" />
        </linearGradient>
      </defs>

      {/* Ring track + progress */}
      <circle cx="50" cy="50" r={R} fill="none" stroke="hsl(272 40% 50% / 0.18)" strokeWidth="4" />
      <circle
        cx="50"
        cy="50"
        r={R}
        fill="none"
        stroke={done ? platformBranding.colors.packDone : `url(#ring-${id})`}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={done ? 0 : C * (1 - Math.max(0, Math.min(1, progress)))}
        transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dashoffset 300ms ease-out" }}
      />
      {spinning && !done && (
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="hsl(272 90% 75%)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${C * 0.12} ${C}`}
          className="origin-center animate-spin"
          style={{ animationDuration: "1.6s" }}
        />
      )}

      {/* Hex plate */}
      <path
        d="M50 13 L81 31 L81 69 L50 87 L19 69 L19 31 Z"
        fill={`url(#plate-${id})`}
        stroke="hsl(272 90% 80% / 0.6)"
        strokeWidth="1.5"
      />
      <path
        d="M50 18 L77 33.5 L77 66.5 L50 82 L23 66.5 L23 33.5 Z"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.18"
        strokeWidth="1"
      />

      {/* Frame with a painted stroke + drip */}
      <rect
        x="32"
        y="33"
        width="28"
        height="22"
        rx="2.5"
        fill="hsl(272 60% 20% / 0.55)"
        stroke="#fff"
        strokeWidth="2"
      />
      <path
        d="M35 49 C40 41, 45 47, 49 40 S 56 38, 57 44"
        fill="none"
        stroke="hsl(190 95% 65%)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M44 55 v5 a1.6 1.6 0 0 0 3.2 0 v-3" fill="hsl(190 95% 65%)" />

      {/* Spray can */}
      <rect x="58" y="47" width="10" height="17" rx="2.5" fill={`url(#can-${id})`} />
      <rect x="60" y="44" width="6" height="3.5" rx="1" fill="#fff" />
      <circle cx="56" cy="44.5" r="0.9" fill="#fff" />
      <circle cx="53.5" cy="43" r="0.7" fill="#fff" opacity="0.8" />
      <circle cx="54" cy="46.5" r="0.6" fill="#fff" opacity="0.6" />

      {/* Sparkles */}
      <path
        d="M28 64 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4z"
        fill="#fff"
        opacity="0.9"
      />
      <path
        d="M71 28 l1 2.2 2.2 1 -2.2 1 -1 2.2 -1 -2.2 -2.2 -1 2.2 -1z"
        fill="#fff"
        opacity="0.75"
      />

      {done && (
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={platformBranding.colors.packDoneGlow}
          strokeWidth="6"
        />
      )}
    </svg>
  );
}
