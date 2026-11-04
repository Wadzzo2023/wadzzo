"use client";

import { MapPin, Plus, X } from "lucide-react";
import { Marker } from "react-map-gl/mapbox";

import type { SearchedPlace } from "~/store/map-stores";

/**
 * Marks the place picked in the search box: a pin with its name, a "new pin
 * here" action and a way to clear it. Clicks stay on the marker, so they don't
 * also start a pin on the map underneath.
 */
export function SearchedPlaceMarker({
  place,
  onDrop,
  onClear,
}: {
  place: SearchedPlace;
  onDrop: (place: SearchedPlace) => void;
  onClear: () => void;
}) {
  return (
    <Marker
      longitude={place.lng}
      latitude={place.lat}
      anchor="bottom"
      style={{ zIndex: 5 }}
      onClick={(e) => e.originalEvent.stopPropagation()}
    >
      <div className="flex flex-col items-center">
        <div className="bg-card flex max-w-56 items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-xs shadow-lg">
          <span className="truncate font-medium">{place.name}</span>
          <button
            type="button"
            onClick={() => onDrop(place)}
            className="bg-primary text-primary-foreground flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 font-semibold"
          >
            <Plus className="size-3" /> Pin here
          </button>
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear searched place"
            className="text-muted-foreground hover:text-foreground rounded-full p-1"
          >
            <X className="size-3" />
          </button>
        </div>
        <MapPin className="text-primary fill-primary/30 -mt-0.5 size-8 drop-shadow" />
      </div>
    </Marker>
  );
}
