import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Compass, Crosshair } from "lucide-react";

import { cn } from "@wadzzo/ui/lib/cn";

import { setMapMode, useMapMode } from "~/lib/ar/theme";

/**
 * ── MapControls ────────────────────────────────────────────────────────────
 *
 * The right-hand rail: recenter, compass map, 2D / 3D and the drop layers. Recenter also refreshes the pins (they
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
  layers,
}: {
  onRecenter: () => void;
  compassMode: boolean;
  onToggleCompass: () => void;
  following: boolean;
  /** The pins are being refreshed (a ring spins round the recenter button). */
  refetching?: boolean;
  /**
   * The Layers button (docs/layers: which drops the map shows), below 2D / 3D. The map type
   * and terrain are in Settings.
   */
  layers?: ReactNode;
}) {
  const key = "relative flex h-11 w-11 items-center justify-center transition-colors";
  const lit = "text-ar-green-hot drop-shadow-[0_0_8px_hsl(var(--ar-green)/0.9)]";
  const idle = "text-ar-dim hover:text-ar-text";
  const mode = useMapMode();
  const next = mode === "3d" ? "2D" : "3D";
  return (
    <div className="pointer-events-none absolute top-1/2 right-3.5 z-30 -translate-y-1/2">
      {/* One glass capsule: recenter (+ refresh), compass map, 2D/3D, layers. */}
      <div className="ar-glass pointer-events-auto flex flex-col overflow-hidden rounded-full">
        {/* ── Recenter + refresh ─────────────────────────────────────── */}
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
          className={cn(key, following ? lit : idle)}
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

        <span aria-hidden className="bg-ar-line mx-2.5 h-px" />

        {/* ── Compass map ───────────────────────────────────────────────
            Turns the map to your heading instead of holding north up. Lives
            here rather than in the profile's settings because on iOS
            device-orientation permission is only granted from inside a user
            gesture, so the tap that enables it has to be the tap that asks.
            Switching it off returns the map to north. */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onToggleCompass}
          aria-label={
            compassMode ? "Compass map on — switch to north up" : "Turn the map to your heading"
          }
          aria-pressed={compassMode}
          className={cn(key, compassMode ? lit : idle)}
        >
          <Compass size={18} strokeWidth={2.1} />
        </motion.button>

        <span aria-hidden className="bg-ar-line mx-2.5 h-px" />

        {/* ── 2D / 3D: shows the one it switches to (also in Settings) ── */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setMapMode(mode === "3d" ? "2d" : "3d")}
          aria-label={`Switch to the ${next} map`}
          title={`${next} map`}
          className={cn(key, idle, "font-hud text-[12px] font-bold tracking-wide")}
        >
          {next}
        </motion.button>

        {/* ── Layers: which drops the map shows ───────────────────── */}
        {layers && (
          <>
            <span aria-hidden className="bg-ar-line mx-2.5 h-px" />
            {layers}
          </>
        )}
      </div>
    </div>
  );
}
