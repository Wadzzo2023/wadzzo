"use client";

import { Check, Lock } from "lucide-react";
import { useMemo } from "react";
import { Layer, Marker, Source } from "react-map-gl/mapbox";

import { cn } from "@wadzzo/ui/lib/cn";

import { nextStop, trailColor, type FanTrail } from "~/lib/ar/trails";

/**
 * The followed trail on the map: its path in the trail's colour over a white outline, solid
 * where you've walked it (both ends collected) and dashed ahead, and a numbered chip over each
 * stop (✓ collected, 🔒 locked, the next one ringed). Drawn inside the map, under the pins.
 */
export function TrailMapLayer({
  trail,
  variant = "badge",
  focused = null,
  onStop,
}: {
  trail: FanTrail;
  /**
   * "badge": a number chip above each stop's pin (the main map, where the pins are drawn).
   * "stop": the stop itself, its picture in a ring with the number (the trail page, no pins).
   */
  variant?: "badge" | "stop";
  /** The stop picked in the list (by position), drawn larger. */
  focused?: number | null;
  onStop?: (position: number) => void;
}) {
  const color = trailColor(trail);
  // One feature per section (stop n → n+1), straight where the brand didn't route it.
  const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
    () => ({
      type: "FeatureCollection",
      features: trail.stops.slice(0, -1).map((a, i) => {
        const b = trail.stops[i + 1]!;
        const section = trail.path[i];
        return {
          type: "Feature",
          properties: { walked: a.done && b.done },
          geometry: {
            type: "LineString",
            coordinates:
              section && section.length >= 2
                ? section
                : [
                    [a.lng, a.lat],
                    [b.lng, b.lat],
                  ],
          },
        };
      }),
    }),
    [trail.stops, trail.path],
  );
  const next = nextStop(trail);
  return (
    <>
      <Source id="fan-trail" type="geojson" data={data}>
        <Layer
          id="fan-trail-casing"
          type="line"
          layout={{ "line-join": "round", "line-cap": "round" }}
          paint={{
            "line-color": "#ffffff",
            "line-width": 8,
            "line-opacity": 0.85,
            "line-emissive-strength": 1,
          }}
        />
        <Layer
          id="fan-trail-walked"
          type="line"
          filter={["==", ["get", "walked"], true]}
          layout={{ "line-join": "round", "line-cap": "round" }}
          paint={{ "line-color": color, "line-width": 4.5, "line-emissive-strength": 1 }}
        />
        <Layer
          id="fan-trail-ahead"
          type="line"
          filter={["==", ["get", "walked"], false]}
          layout={{ "line-join": "round", "line-cap": "butt" }}
          paint={{
            "line-color": color,
            "line-width": 4.5,
            "line-dasharray": [1.6, 1.1],
            "line-emissive-strength": 1,
          }}
        />
      </Source>
      {variant === "stop" &&
        trail.stops.map((s) => {
          const dim = (Boolean(s.lockReason) || s.unavailable) && !s.done;
          const big = focused === s.position;
          return (
            <Marker
              key={s.position}
              latitude={s.lat}
              longitude={s.lng}
              anchor="center"
              style={{ zIndex: big ? 12 : 11 }}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onStop?.(s.position);
              }}
            >
              <button
                type="button"
                aria-label={`Stop ${s.position}: ${s.title}${s.done ? ", collected" : s.lockReason ? ", locked" : ""}`}
                className={cn(
                  "relative block rounded-full border-[3px] bg-white shadow-lg transition-transform",
                  big ? "size-14" : "size-11",
                  dim && "opacity-70 grayscale",
                  next?.position === s.position &&
                    !big &&
                    "ring-ar-green-hot ring-2 ring-offset-2 ring-offset-black/40",
                )}
                style={{ borderColor: s.required ? color : "#9ca3af" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.imageUrl} alt="" className="size-full rounded-full object-cover" />
                <span
                  className="font-hud absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white"
                  style={{ backgroundColor: s.done ? "#16a34a" : color }}
                >
                  {s.done ? (
                    <Check size={11} strokeWidth={3.5} />
                  ) : s.lockReason ? (
                    <Lock size={9} />
                  ) : (
                    s.position
                  )}
                </span>
              </button>
            </Marker>
          );
        })}
      {variant === "badge" &&
        trail.stops.map((s) => (
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
