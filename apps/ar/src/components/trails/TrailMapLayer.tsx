"use client";

import { Check, Lock } from "lucide-react";
import { useMemo } from "react";
import { Layer, Marker, Source } from "react-map-gl/mapbox";

import { trailsToFeatures } from "@wadzzo/geo/trail-geometry";
import { cn } from "@wadzzo/ui/lib/cn";

import { nextStop, trailColor, type FanTrail } from "~/lib/ar/trails";

/**
 * The followed trail on the map: its path in the trail's colour over a white outline, and a
 * numbered chip over each stop (✓ collected, 🔒 locked, the next one ringed). Drawn inside the
 * map, under the pins.
 */
export function TrailMapLayer({ trail }: { trail: FanTrail }) {
  const color = trailColor(trail);
  const data = useMemo(
    () =>
      trailsToFeatures([
        {
          id: trail.id,
          color,
          draft: false,
          ordered: trail.order === "ORDERED",
          sections: trail.path,
        },
      ]),
    [trail.id, trail.path, trail.order, color],
  );
  const next = nextStop(trail);
  return (
    <>
      <Source id="fan-trail" type="geojson" data={data}>
        <Layer
          id="fan-trail-casing"
          type="line"
          layout={{ "line-join": "round", "line-cap": "round" }}
          paint={{ "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.9 }}
        />
        <Layer
          id="fan-trail-line"
          type="line"
          layout={{ "line-join": "round", "line-cap": "round" }}
          paint={{ "line-color": ["get", "color"], "line-width": 4.5 }}
        />
      </Source>
      {trail.stops.map((s) => (
        <Marker
          key={s.position}
          latitude={s.lat}
          longitude={s.lng}
          anchor="bottom"
          offset={[0, -62]}
          style={{ zIndex: 11, pointerEvents: "none" }}
        >
          <span
            aria-label={`Stop ${s.position}${s.done ? ", collected" : s.lockReason ? ", locked" : ""}`}
            className={cn(
              "font-hud flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full border-2 border-white px-1 text-[11px] font-bold text-white shadow",
              (Boolean(s.lockReason) || s.unavailable) && !s.done && "opacity-60 grayscale",
              next?.position === s.position && "ring-ar-green-hot ring-2 ring-offset-1",
            )}
            style={{ backgroundColor: color }}
          >
            {s.done ? (
              <Check size={12} strokeWidth={3} />
            ) : s.lockReason ? (
              <Lock size={10} />
            ) : null}
            {s.position}
          </span>
        </Marker>
      ))}
    </>
  );
}
