import { motion } from "framer-motion";
import { Compass, Crosshair } from "lucide-react";

import type { MapMode } from "~/lib/ar/theme";
import { cn } from "@wadzzo/ui/lib/cn";

import { MapModeButton } from "./MapModeButton";

/**
 * ── MapControls ────────────────────────────────────────────────────────────
 *
 * The right-hand rail: recenter, compass map and 2D/3D. Recenter also refreshes the pins (they
 * used to be two buttons in one capsule: the same gesture in a collector's head, "put me back and
 * tell me what's here"). Auto-collect and the murals layer are profile settings now.
 *
 * The rail sits above the nearby strip and below the filter row, on the right edge — these are
 * all cheap and reversible, so reach wins.
 */
export function MapControls({
  onRecenter,
  compassMode,
  onToggleCompass,
  following,
  refetching = false,
  mapMode,
  onToggleMapMode,
}: {
  onRecenter: () => void;
  compassMode: boolean;
  onToggleCompass: () => void;
  following: boolean;
  /** The pins are being refreshed (a ring spins round the recenter button). */
  refetching?: boolean;
  /** Flat 2D or tilted 3D basemap. */
  mapMode?: MapMode;
  onToggleMapMode?: () => void;
}) {
  return (
    <div className="pointer-events-none absolute top-1/2 right-3.5 z-30 flex -translate-y-1/2 flex-col items-end gap-2.5">
      {/* ── Recenter + refresh ───────────────────────────────────────── */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={onRecenter}
        aria-label={
          refetching
            ? "Refreshing pins"
            : following
              ? "Following your location — tap to refresh pins"
              : "Recenter on your location and refresh pins"
        }
        aria-pressed={following}
        aria-busy={refetching}
        className={cn(
          "ar-glass pointer-events-auto relative flex h-11 w-11 items-center justify-center rounded-full transition-colors",
          following
            ? "text-ar-green-hot drop-shadow-[0_0_8px_hsl(var(--ar-green)/0.9)]"
            : "text-ar-dim hover:text-ar-text",
        )}
      >
        {refetching && (
          <motion.span
            aria-hidden
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
            className="border-t-ar-green-hot absolute inset-[3px] rounded-full border-2 border-transparent"
          />
        )}
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
