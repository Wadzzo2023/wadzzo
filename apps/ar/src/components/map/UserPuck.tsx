import { motion } from "framer-motion";

import type { GeoFix } from "~/lib/ar/types";

/**
 * ── UserPuck ───────────────────────────────────────────────────────────────
 *
 * Where you are, how sure we are, and which way you're facing.
 *
 * The accuracy disc is drawn in screen pixels rather than as a geographic
 * circle, so it doesn't need a GeoJSON source and a re-render per frame — but
 * it *is* scaled by the current zoom so it still means something. At a metre
 * per pixel a 30 m fix is a 30 px disc; zoom out and it shrinks with the
 * world, the way the real uncertainty does.
 *
 * The heading cone only appears once there's a heading worth trusting. A
 * stationary phone reports null or garbage, and a cone that spins while
 * someone stands still is worse than no cone at all.
 */
export function UserPuck({
  fix,
  metersPerPixel,
}: {
  fix: GeoFix;
  /** Ground resolution at the current latitude and zoom. */
  metersPerPixel: number;
}) {
  // Clamped so a 2 km cold fix doesn't paint the entire screen green, and a
  // perfect one is still visible.
  const accuracyPx = Math.max(26, Math.min(fix.accuracy / metersPerPixel, 190));

  const hasHeading = fix.heading != null && Number.isFinite(fix.heading);
  const moving = (fix.speed ?? 0) > 0.6;

  return (
    <div className="pointer-events-none relative flex items-center justify-center">
      {/* Accuracy disc */}
      <motion.span
        aria-hidden
        className="border-ar-green/35 bg-ar-green/12 absolute rounded-full border"
        animate={{ width: accuracyPx, height: accuracyPx }}
        transition={{ type: "spring", stiffness: 120, damping: 22 }}
      />

      {/* Outward sonar, faster while you're actually moving. */}
      <span
        aria-hidden
        className="animate-pulse-ring border-ar-green-hot absolute h-9 w-9 rounded-full border"
        style={{ animationDuration: moving ? "1.5s" : "2.6s" }}
      />

      {/* Heading cone */}
      {hasHeading && (
        <motion.span
          aria-hidden
          className="absolute h-[46px] w-[46px]"
          animate={{ rotate: fix.heading! }}
          transition={{ type: "spring", stiffness: 90, damping: 18 }}
          style={{
            background:
              "conic-gradient(from -26deg, hsl(var(--ar-green-hot)/0.55), transparent 52deg)",
            maskImage: "radial-gradient(circle, black 30%, transparent 72%)",
            WebkitMaskImage: "radial-gradient(circle, black 30%, transparent 72%)",
            borderRadius: "9999px",
          }}
        />
      )}

      {/* The puck itself */}
      <span className="bg-ar-green-hot relative h-[17px] w-[17px] rounded-full shadow-[0_0_0_3px_rgba(255,255,255,0.92),0_0_20px_4px_hsl(var(--ar-green)/0.85)]" />
    </div>
  );
}

/**
 * Ground resolution in metres per screen pixel for a Web Mercator zoom level.
 * 156543.03392 m/px is the equatorial resolution at zoom 0 for 256 px tiles;
 * cos(lat) corrects for the projection's stretch toward the poles.
 */
export function metersPerPixel(latitude: number, zoom: number): number {
  return (156_543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
}
