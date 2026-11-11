"use client";

import { Route } from "lucide-react";
import { useMemo } from "react";
import { Layer, Marker, Source } from "react-map-gl/mapbox";

import { trailColor } from "~/lib/ar/trails";

/** What a line needs: `trails.nearby` and `trails.inArea` both give this. */
export type TrailLine = {
  id: string;
  title: string;
  color: string | null;
  path: [number, number][][];
  stops: { lat: number; lng: number }[];
  /** Its map layer (docs/layers), or null/absent for a regular trail. */
  layerId?: string | null;
};

/**
 * Discover (docs/trails): trails near you and in view as faint lines on the map, with a name chip at each
 * one's first stop that opens the trail. Shown while you aren't following one, so the map
 * says "there's a trail here" without competing with the pins.
 */
export function NearbyTrailLines({
  trails,
  onOpen,
}: {
  trails: TrailLine[];
  onOpen: (id: string) => void;
}) {
  const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
    () => ({
      type: "FeatureCollection",
      features: trails.flatMap((t) => {
        const coordinates = t.path.length
          ? t.path.flat()
          : t.stops.map((s) => [s.lng, s.lat] as [number, number]);
        return coordinates.length >= 2
          ? [
              {
                type: "Feature" as const,
                properties: { color: trailColor(t) },
                geometry: { type: "LineString" as const, coordinates },
              },
            ]
          : [];
      }),
    }),
    [trails],
  );

  return (
    <>
      <Source id="nearby-trails" type="geojson" data={data}>
        <Layer
          id="nearby-trails-line"
          type="line"
          layout={{ "line-join": "round", "line-cap": "round" }}
          paint={{
            "line-color": ["get", "color"],
            "line-width": 3,
            "line-opacity": 0.55,
            "line-dasharray": [1.4, 1.2],
            "line-emissive-strength": 1,
          }}
        />
      </Source>
      {trails.map((t) => {
        const start = t.stops[0];
        if (!start) return null;
        return (
          <Marker
            key={t.id}
            latitude={start.lat}
            longitude={start.lng}
            anchor="bottom"
            offset={[0, -60]}
            style={{ zIndex: 10 }}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onOpen(t.id);
            }}
          >
            <button
              type="button"
              className="ar-glass font-hud text-ar-text flex max-w-[150px] items-center gap-1 rounded-full py-1 pr-2.5 pl-1.5 text-[10px] font-bold tracking-[0.06em] uppercase shadow"
            >
              <span
                className="flex size-4 shrink-0 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: trailColor(t) }}
              >
                <Route size={10} strokeWidth={2.6} />
              </span>
              <span className="truncate">{t.title}</span>
            </button>
          </Marker>
        );
      })}
    </>
  );
}
