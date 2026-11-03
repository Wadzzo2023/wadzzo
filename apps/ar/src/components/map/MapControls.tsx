import { motion } from "framer-motion";
import { Compass, Crosshair } from "lucide-react";

import type { MapMode } from "~/lib/ar/theme";
import { cn } from "@wadzzo/ui/lib/cn";

import { MapModeButton } from "./MapModeButton";

/**
 * ── MapControls ────────────────────────────────────────────────────────────
 *
 * The right-hand rail: recenter, compass map and 2D/3D. (Refresh, auto-collect and the murals
 * layer used to live here too; pins refresh on their own, auto-collect is a profile setting, and
 * murals always show.)
 *
 * The rail sits above the nearby strip and below the filter row, on the right edge — these are
 * all cheap and reversible, so reach wins.
 */
export function MapControls({
  onRecenter,
  compassMode,
  onToggleCompass,
  following,
  mapMode,
  onToggleMapMode,
}: {
  onRecenter: () => void;
  compassMode: boolean;
  onToggleCompass: () => void;
  following: boolean;
  /** Flat 2D or tilted 3D basemap. */
  mapMode?: MapMode;
  onToggleMapMode?: () => void;
}) {
  return (
    <div className="pointer-events-none absolute top-1/2 right-3.5 z-30 flex -translate-y-1/2 flex-col items-end gap-2.5">
      {/* ── Recenter ────────────────────────────────────────────────── */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={onRecenter}
        aria-label={following ? "Following your location" : "Recenter on your location"}
        aria-pressed={following}
        className={cn(
          "ar-glass pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full transition-colors",
          following
            ? "text-ar-green-hot drop-shadow-[0_0_8px_hsl(var(--ar-green)/0.9)]"
            : "text-ar-dim hover:text-ar-text",
        )}
      >
        <Crosshair size={19} strokeWidth={2.1} />
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
        aria-label={
          compassMode ? "Compass map on — switch to north up" : "Turn the map to your heading"
        }
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
    </div>
  );
}
