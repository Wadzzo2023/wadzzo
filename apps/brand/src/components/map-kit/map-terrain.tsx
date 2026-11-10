"use client";

import { useEffect, useState } from "react";
import { Layer, Source, useMap } from "react-map-gl/mapbox";

import { isStandardStyle, useMapBase, useMapMode, useMapTerrain } from "./map-mode";

/**
 * Terrain (the Layers panel; on by itself for a Hike trail): hill shading and contour lines
 * with heights, from Mapbox's terrain tiles. Under roads and labels: Standard's bottom slot, or
 * below the first label layer of the other styles. BaseMap draws it before its children.
 */
export function MapTerrain({ force = false }: { force?: boolean }) {
  const on = useMapTerrain() || force;
  const mode = useMapMode();
  const base = useMapBase();
  const standard = isStandardStyle(mode, base);
  const { current } = useMap();
  // Layers can only be added once the style (and Standard's import) has loaded.
  const [styleIn, setStyleIn] = useState(false);
  const [beforeId, setBeforeId] = useState<string | undefined>();
  useEffect(() => {
    const map = current?.getMap();
    if (!map) return;
    const loaded = () => {
      setStyleIn(true);
      setBeforeId(map.getStyle()?.layers?.find((l) => l.type === "symbol")?.id);
    };
    const loading = () => setStyleIn(false);
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
          paint={{ "hillshade-exaggeration": 0.45, "hillshade-shadow-color": "#3f3f46" }}
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
            "line-opacity": ["case", ["==", ["%", ["get", "index"], 5], 0], 0.55, 0.25],
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
