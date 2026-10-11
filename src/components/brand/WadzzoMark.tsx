import { motion, type MotionProps } from "framer-motion";

/**
 * ── WadzzoMark ─────────────────────────────────────────────────────────────
 *
 * The brand icon, using the actual source artwork (`public/brand/wadzzo-mark.png`,
 * copied from the main Wadzzo app's `images/loading.png`) rather than a
 * redrawn vector — hand-recreating it as SVG twice did not read as the same
 * mark. Wrapped as `motion.img` so it can still be scaled, glowed, and
 * animated in the boot sequence and elsewhere.
 */
export function WadzzoMark({
  className,
  glow = false,
  ...motionProps
}: {
  className?: string;
  /** Adds the app's standard green glow (matches `.text-glow` on text). */
  glow?: boolean;
} & MotionProps) {
  return (
     
    <motion.img
      src="/brand/wadzzo-mark.png"
      alt="Wadzzo"
      className={className}
      style={
        glow
          ? { filter: "drop-shadow(0 0 16px hsl(var(--ar-green) / 0.75))" }
          : undefined
      }
      {...motionProps}
    />
  );
}
