import { MapPin } from "lucide-react";

import { cn } from "@wadzzo/ui/lib/cn";

/**
 * Where a pin in a map card is (docs/layers: forms open as cards on the base map), shown at
 * the top of the card under the layer note. A click on the map moves it.
 */
export function SpotNote({
  at,
  what = "pin",
}: {
  at: { lat: number; lng: number } | null | undefined;
  what?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-xs",
        at ? "border-foreground/10 bg-muted/40" : "border-destructive/40",
      )}
    >
      <MapPin className={cn("size-4 shrink-0", at ? "text-primary" : "text-destructive")} />
      {at ? (
        <span className="min-w-0">
          <span className="font-semibold tabular-nums">
            {at.lat.toFixed(5)}, {at.lng.toFixed(5)}
          </span>
          <span className="text-muted-foreground"> · Click the map to move it.</span>
        </span>
      ) : (
        <p className="text-destructive">Click the map where the {what} goes.</p>
      )}
    </div>
  );
}
