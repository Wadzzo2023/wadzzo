import type { MapMode } from "~/lib/ar/theme";
import { cn } from "@wadzzo/ui/lib/cn";

/**
 * Round glass button that flips the map between the flat 2D map and the tilted
 * 3D city. It names the mode it switches to, the way map apps do.
 */
export function MapModeButton({
  mode,
  onToggle,
  className,
}: {
  mode: MapMode;
  onToggle: () => void;
  className?: string;
}) {
  const next = mode === "3d" ? "2D" : "3D";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Switch to the ${next} map`}
      title={`Switch to the ${next} map`}
      className={cn(
        "ar-glass font-hud text-ar-dim hover:text-ar-text pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-[12px] font-bold tracking-wide transition-colors",
        className,
      )}
    >
      {next}
    </button>
  );
}
