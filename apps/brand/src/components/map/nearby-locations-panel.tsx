"use client";

import { format } from "date-fns";
import { ChevronDown, Clock, Hexagon, MapPin, Users } from "lucide-react";
import { memo, useMemo, useState } from "react";

import { cn } from "@wadzzo/ui/lib/cn";
import { PinGlyph } from "@wadzzo/ui/patterns/pin-glyph";
import { PIN_LOOK, pinLook, pinStateOf, shapeScale } from "~/components/map-kit/pin-marker";
import { useNearbyPinsStore, type PinOnMap } from "~/store/map-stores";
import { pinLookOf } from "~/utils/map-helpers";

/** The most pins listed at once; with thousands in view, drawing them all would freeze the page. */
const MAX_LISTED = 50;

/** A pin as the map draws it (its shape, image or colour, state outline), small, for a list row. */
function PinThumb({ pin, now }: { pin: PinOnMap; now: number }) {
  const look = useMemo(() => pinLookOf(pin), [pin]);
  const style = PIN_LOOK[pinLook(pinStateOf(pin, now))];
  return (
    <span className="flex size-11 shrink-0 items-center justify-center">
      <PinGlyph
        path={look.path}
        size={Math.round(34 * shapeScale(look.path))}
        color={look.color}
        defaultColor="hsl(var(--surface-2, var(--muted)))"
        imageUrl={look.imageUrl}
        imageFit={look.imageFit}
        ringColor={style.ring}
        ringWidth={2}
        badge={look.autoBadge}
        className={cn(style.opacity, style.ring.includes("muted") && "grayscale")}
      />
    </span>
  );
}

/**
 * "In view": the pins inside the visible map area (desktop). Click one to fly
 * to it. Collapsible so it never covers what you're looking at.
 */
export const NearbyLocationsPanel = memo(function NearbyLocationsPanel({
  onSelectPlace,
  className,
  showLayer,
}: {
  onSelectPlace: (coords: { lat: number; lng: number }) => void;
  className?: string;
  /**
   * The base map's layers (docs/layers): whether a pin in this layer (null = regular) is on the
   * map. Left out, every pin is listed.
   */
  showLayer?: (layerId: string | null) => boolean;
}) {
  const { nearbyPins: inView } = useNearbyPinsStore();
  const nearbyPins = useMemo(
    () => (showLayer ? inView.filter((p) => showLayer(p.locationGroup?.layerId ?? null)) : inView),
    [inView, showLayer],
  );
  const [open, setOpen] = useState(true);
  // Taken once: whether a pin has expired is judged the same way on the map and here.
  const [now] = useState(() => Date.now());
  return (
    <section
      className={cn(
        "bg-card/95 border-foreground/10 pointer-events-auto hidden w-80 overflow-hidden rounded-[1.4rem] border-2 shadow-lg md:block",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <MapPin className="text-primary size-4" />
        <span className="font-hud text-sm font-semibold">In view</span>
        <span className="bg-surface-2 font-hud rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">
          {nearbyPins.length}
        </span>
        <ChevronDown
          className={cn(
            "text-muted-foreground ml-auto size-4 transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open && (
        <div className="max-h-80 scrollbar-thin overflow-y-auto border-t">
          {nearbyPins.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm">
              No pins in this area. Zoom out or move the map.
            </p>
          ) : (
            <ul className="divide-y">
              {nearbyPins.slice(0, MAX_LISTED).map((pin) => (
                <li key={pin.id}>
                  <button
                    type="button"
                    onClick={() => onSelectPlace({ lat: pin.latitude, lng: pin.longitude })}
                    className="hover:bg-accent flex w-full items-center gap-3 px-4 py-2.5 text-left"
                  >
                    <PinThumb pin={pin} now={now} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {pin.locationGroup?.title ?? "Untitled pin"}
                        </span>
                        {pin.locationGroup?.hotspotId && (
                          <span className="bg-primary/10 font-hud text-primary inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                            <Hexagon className="size-2.5" /> Hotspot
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground mt-0.5 flex items-center gap-3 text-xs">
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" /> {pin._count.consumers}
                        </span>
                        {pin.locationGroup?.endDate && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <Clock className="size-3" /> Ends{" "}
                            {format(new Date(pin.locationGroup.endDate), "MMM d")}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {nearbyPins.length > MAX_LISTED && (
            <p className="text-muted-foreground border-t px-4 py-3 text-center text-xs">
              Showing {MAX_LISTED} of {nearbyPins.length.toLocaleString("en-US")} — zoom in to see
              the rest.
            </p>
          )}
        </div>
      )}
    </section>
  );
});
