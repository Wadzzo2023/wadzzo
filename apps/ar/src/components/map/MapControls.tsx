import { motion } from "framer-motion";
import { Compass, Crosshair, Frame, RotateCw, Zap } from "lucide-react";

import type { MapMode } from "~/lib/ar/theme";
import { cn } from "@wadzzo/ui/lib/cn";

import { MapModeButton } from "./MapModeButton";

/**
 * ── MapControls ────────────────────────────────────────────────────────────
 *
 * The right-hand rail. Recenter and refetch are welded into one capsule
 * rather than two floating circles: they're the same gesture in a collector's
 * head ("put me back and tell me what's here"), they're pressed in sequence,
 * and one capsule costs half the thumb travel of two buttons.
 *
 * The rail sits above the nearby strip and below the filter row, on the right
 * edge — the far side from the thumb's resting arc is deliberate for
 * destructive-adjacent controls, but these are all cheap and reversible, so
 * reach wins.
 */
export function MapControls({
  onRecenter,
  onRefetch,
  compassMode,
  onToggleCompass,
  refetching,
  following,
  autoCollect,
  onToggleAutoCollect,
  muralLayer,
  onCycleMuralLayer,
  mapMode,
  onToggleMapMode,
}: {
  onRecenter: () => void;
  onRefetch: () => void;
  compassMode: boolean;
  onToggleCompass: () => void;
  refetching: boolean;
  following: boolean;
  autoCollect: boolean;
  onToggleAutoCollect: () => void;
  /** Murals on the map: every one, verified only, or hidden. */
  muralLayer?: "all" | "verified" | "off";
  onCycleMuralLayer?: () => void;
  /** Flat 2D or tilted 3D basemap. */
  mapMode?: MapMode;
  onToggleMapMode?: () => void;
}) {
  return (
    <div className="pointer-events-none absolute right-3.5 top-1/2 z-30 flex -translate-y-1/2 flex-col items-end gap-2.5">
      {/* ── Recenter + refetch, one capsule ─────────────────────────── */}
      <div className="ar-glass pointer-events-auto flex flex-col overflow-hidden rounded-full">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onRecenter}
          aria-label={following ? "Following your location" : "Recenter on your location"}
          aria-pressed={following}
          className={cn(
            "flex h-11 w-11 items-center justify-center transition-colors",
            following
              ? "text-ar-green-hot drop-shadow-[0_0_8px_hsl(var(--ar-green)/0.9)]"
              : "text-ar-dim hover:text-ar-text",
          )}
        >
          <Crosshair size={19} strokeWidth={2.1} />
        </motion.button>

        <span aria-hidden className="mx-2.5 h-px bg-ar-line" />

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onRefetch}
          aria-label="Refresh pins"
          disabled={refetching}
          className="flex h-11 w-11 items-center justify-center text-ar-dim transition-colors hover:text-ar-text disabled:opacity-60"
        >
          <motion.span
            animate={refetching ? { rotate: 360 } : { rotate: 0 }}
            transition={
              refetching
                ? { duration: 0.9, repeat: Infinity, ease: "linear" }
                : { duration: 0.2 }
            }
          >
            <RotateCw size={18} strokeWidth={2.1} />
          </motion.span>
        </motion.button>
      </div>

      {/* ── Auto-collect ────────────────────────────────────────────── */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={onToggleAutoCollect}
        aria-label="Auto-collect"
        aria-pressed={autoCollect}
        className={cn(
          "ar-glass pointer-events-auto relative flex h-11 w-11 items-center justify-center rounded-full transition-colors",
          autoCollect
            ? "!border-ar-green/60 text-ar-green-hot ar-glow"
            : "text-ar-dim hover:text-ar-text",
        )}
      >
        {autoCollect && (
          <span
            aria-hidden
            className="animate-pulse-ring absolute inset-0 rounded-full border border-ar-green-hot"
          />
        )}
        <Zap
          size={18}
          strokeWidth={2.2}
          className={cn(autoCollect && "fill-ar-green-hot/30")}
        />
      </motion.button>

      {/* ── Compass map ─────────────────────────────────────────────────
          Turns the map to your heading instead of holding north up. Lives
          here rather than in the profile's settings list because this is
          where it's used and — on iOS — where it can legally be switched on
          at all: device-orientation permission is only granted from inside a
          user gesture, so the tap that enables it has to be the tap that
          asks. Switching it off returns the map to north. */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={onToggleCompass}
        aria-label={compassMode ? "Compass map on — switch to north up" : "Turn the map to your heading"}
        aria-pressed={compassMode}
        className={cn(
          "ar-glass pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full transition-colors",
          compassMode
            ? "text-ar-green-hot drop-shadow-[0_0_8px_hsl(var(--ar-green)/0.9)]"
            : "text-ar-dim hover:text-ar-text",
        )}
      >
        <Compass size={18} strokeWidth={2.1} />
      </motion.button>

      {/* ── 2D / 3D ─────────────────────────────────────────────────── */}
      {mapMode && onToggleMapMode && <MapModeButton mode={mapMode} onToggle={onToggleMapMode} />}

      {/* ── Murals layer ───────────────────────────────────────────────
          One tap cycles all → verified only → hidden; the map's toast says
          which, since a dashed vs solid icon is too subtle on its own. */}
      {onCycleMuralLayer && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onCycleMuralLayer}
          aria-label={
            muralLayer === "off" ? "Murals hidden — show them" : muralLayer === "verified" ? "Showing verified murals — hide murals" : "Showing all murals — verified only"
          }
          className={cn(
            "ar-glass pointer-events-auto relative flex h-11 w-11 items-center justify-center rounded-full transition-colors",
            muralLayer === "off" ? "text-ar-faint" : "text-rarity-epic",
          )}
        >
          <Frame size={18} strokeWidth={2.1} className={cn(muralLayer === "off" && "opacity-50")} />
          {muralLayer === "verified" && (
            <span aria-hidden className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full bg-ar-green-hot" />
          )}
        </motion.button>
      )}
    </div>
  );
}
