"use client";

import { useEffect, useMemo, useState } from "react";
import { Layer, Source, useMap } from "react-map-gl/mapbox";

/** Drawn under this layer (the trail lines) when it's on the map. */
const UNDER = "trail-casing";

/**
 * Trail mode's extra map layers (docs/trails): an imported GPX track as a grey guide, the
 * section being drawn with its bends as dots. (Satellite and terrain are in the map's Layers
 * panel; a Hike trail turns terrain on by itself.)
 */
export function TrailBuildLayers({
  track,
  bends,
  color,
}: {
  track?: [number, number][] | null;
  /** The bends of the section being drawn (dots); null when not drawing. */
  bends: [number, number][] | null;
  color: string;
}) {
  const { current: map } = useMap();
  // Slide the backdrop under the trail lines once they're there (they mount first).
  const [under, setUnder] = useState<string | undefined>();
  useEffect(() => {
    const m = map?.getMap();
    if (!m) return;
    const check = () => setUnder(m.getLayer(UNDER) ? UNDER : undefined);
    check();
    m.on("styledata", check);
    return () => void m.off("styledata", check);
  }, [map]);

  const trackData = useMemo<GeoJSON.Feature<GeoJSON.LineString> | null>(
    () =>
      track && track.length >= 2
        ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: track } }
        : null,
    [track],
  );
  const bendData = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: "FeatureCollection",
      features: (bends ?? []).map((p) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: p },
      })),
    }),
    [bends],
  );

  return (
    <>
      {trackData && (
        <Source id="build-track" type="geojson" data={trackData}>
          <Layer
            id="build-track"
            type="line"
            beforeId={under}
            layout={{ "line-join": "round", "line-cap": "round" }}
            paint={{
              "line-color": "#6b7280",
              "line-width": 3,
              "line-opacity": 0.8,
              "line-dasharray": [2, 1.5],
              "line-emissive-strength": 1,
            }}
          />
        </Source>
      )}
      {bends && (
        <Source id="build-bends" type="geojson" data={bendData}>
          <Layer
            id="build-bends"
            type="circle"
            paint={{
              "circle-radius": 5,
              "circle-color": "#ffffff",
              "circle-stroke-color": color,
              "circle-stroke-width": 2.5,
              "circle-emissive-strength": 1,
            }}
          />
        </Source>
      )}
    </>
  );
}
