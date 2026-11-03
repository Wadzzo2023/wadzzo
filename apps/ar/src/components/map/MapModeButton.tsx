import type { MapMode } from "~/lib/ar/theme";
import { cn } from "@wadzzo/ui/lib/cn";

/**
 * Round glass button that flips the map between the flat 2D map and the tilted
 * 3D city. It names the mode it switches to, the way map apps do. `bare` drops
 * its own glass circle so it can sit inside a shared capsule (the map's rail).
 */
export function MapModeButton({
  mode,
  onToggle,
  bare = false,
  className,
}: {
  mode: MapMode;
  onToggle: () => void;
  bare?: boolean;
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
        "font-hud text-ar-dim hover:text-ar-text pointer-events-auto flex h-11 w-11 items-center justify-center text-[12px] font-bold tracking-wide transition-colors",
        !bare && "ar-glass rounded-full",
        className,
      )}
    >
      {next}
    </button>
  );
}
