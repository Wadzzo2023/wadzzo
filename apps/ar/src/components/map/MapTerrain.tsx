"use client";

import { useEffect, useState } from "react";
import { Layer, Source, useMap } from "react-map-gl/mapbox";

import { isStandardStyle, useMapBase, useMapMode, useMapTerrain } from "~/lib/ar/theme";

/**
 * Terrain (the Layers panel, docs/trails for Hike): hill shading and contour lines with
 * heights, from Mapbox's terrain tiles. On when the viewer switched it on, or `force`d (a Hike
 * trail). Under roads and labels: Standard's bottom slot, or below the first label layer of the
 * other styles. Render it before the app's own layers so theirs stay on top.
 */
export function MapTerrain({ force = false }: { force?: boolean }) {
  const on = useMapTerrain() || force;
  const mode = useMapMode();
  const base = useMapBase();
  const standard = isStandardStyle(mode, base);
  const { current } = useMap();
  // Layers can only be added once the style (and Standard's import) has loaded. Without slots
  // they go under the style's first label layer, looked up as each style comes in (never one
  // of these layers, which would put the contour labels before themselves).
  const [styleIn, setStyleIn] = useState(false);
  const [beforeId, setBeforeId] = useState<string | undefined>();
  useEffect(() => {
    const map = current?.getMap();
    if (!map) return;
    const loaded = () => {
      setStyleIn(true);
      setBeforeId(
        map.getStyle()?.layers?.find((l) => l.type === "symbol" && !l.id.startsWith("map-terrain"))
          ?.id,
      );
    };
    const loading = () => {
      setStyleIn(false);
      setBeforeId(undefined);
    };
    if (map.isStyleLoaded()) loaded();
    map.on("style.load", loaded);
    map.on("styledataloading", loading);
    return () => {
      map.off("style.load", loaded);
      map.off("styledataloading", loading);
    };
  }, [current]);

  if (!on || !styleIn) return null;
  const place = standard ? { slot: "bottom" } : { beforeId };
  return (
    <>
      <Source
        id="map-terrain-dem"
        type="raster-dem"
        url="mapbox://mapbox.mapbox-terrain-dem-v1"
        tileSize={512}
      >
        <Layer
          id="map-terrain-hillshade"
          type="hillshade"
          {...place}
          paint={{
            "hillshade-exaggeration": 0.5,
            "hillshade-shadow-color": "#1f2937",
            "hillshade-highlight-color": "#ffffff",
          }}
        />
      </Source>
      <Source id="map-terrain-contours" type="vector" url="mapbox://mapbox.mapbox-terrain-v2">
        <Layer
          id="map-terrain-contour"
          type="line"
          source-layer="contour"
          {...place}
          paint={{
            "line-color": "#a16207",
            "line-opacity": ["case", ["==", ["%", ["get", "index"], 5], 0], 0.6, 0.28],
            "line-width": ["case", ["==", ["%", ["get", "index"], 5], 0], 1.2, 0.6],
            "line-emissive-strength": 1,
          }}
        />
        <Layer
          id="map-terrain-contour-label"
          type="symbol"
          source-layer="contour"
          {...place}
          filter={["==", ["%", ["get", "index"], 5], 0]}
          layout={{
            "symbol-placement": "line",
            "text-field": ["concat", ["to-string", ["get", "ele"]], " m"],
            "text-size": 10,
          }}
          paint={{
            "text-color": "#854d0e",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.2,
            "text-emissive-strength": 1,
          }}
        />
      </Source>
    </>
  );
}
