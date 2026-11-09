"use client";

import { useEffect, useMemo } from "react";
import { Layer, Source, useMap } from "react-map-gl/mapbox";

import { trailsToFeatures, type TrailLine } from "@wadzzo/geo/trail-geometry";

/** Layer ids, so the map's click handler can tell a click on a trail from a click on the map. */
export const TRAIL_HIT_LAYER = "trail-hit";
const ARROW_IMAGE = "trail-arrow";

/**
 * A chevron for direction arrows along ordered trails, drawn once per map style. It is a
 * signed-distance image, so the layer colours it (dark, with a white halo: readable on
 * the trail's colour and on light or dark maps).
 */
function arrowImage(): ImageData | null {
  const size = 24;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(9, 6);
  ctx.lineTo(16, 12);
  ctx.lineTo(9, 18);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

/**
 * Trails on a brand map: each trail's path in its colour over a white outline,
 * dashed while it is a draft, with direction arrows when its stops go in order.
 * When one is selected the others fade. Clicking a line reports the trail's id.
 *
 * The stops themselves are the brand's pins (PinLayer with `stops`), drawn above
 * the lines.
 */
export function TrailLayer({
  trails,
  selectedId,
  onSelect,
}: {
  trails: TrailLine[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const { current: map } = useMap();
  const data = useMemo(() => trailsToFeatures(trails), [trails]);

  // The arrow image goes with the map style: add it now, and again whenever a new style asks.
  useEffect(() => {
    const m = map?.getMap();
    if (!m) return;
    const add = () => {
      if (m.hasImage(ARROW_IMAGE)) return;
      const img = arrowImage();
      if (img) m.addImage(ARROW_IMAGE, img, { pixelRatio: 2, sdf: true });
    };
    const missing = (e: { id: string }) => e.id === ARROW_IMAGE && add();
    if (m.isStyleLoaded()) add();
    m.on("styleimagemissing", missing);
    return () => void m.off("styleimagemissing", missing);
  }, [map]);

  useEffect(() => {
    if (!map || !onSelect) return;
    const click = (e: mapboxgl.MapLayerMouseEvent) => {
      const id = (e.features?.[0] as { properties?: { id?: string } } | undefined)?.properties?.id;
      if (id) onSelect(id);
    };
    const enter = () => (map.getCanvas().style.cursor = "pointer");
    const leave = () => (map.getCanvas().style.cursor = "");
    map.on("click", TRAIL_HIT_LAYER, click);
    map.on("mouseenter", TRAIL_HIT_LAYER, enter);
    map.on("mouseleave", TRAIL_HIT_LAYER, leave);
    return () => {
      map.off("click", TRAIL_HIT_LAYER, click);
      map.off("mouseenter", TRAIL_HIT_LAYER, enter);
      map.off("mouseleave", TRAIL_HIT_LAYER, leave);
    };
  }, [map, onSelect]);

  const selected = selectedId ?? "";
  const isSelected = ["==", ["get", "id"], selected];
  return (
    <Source id="trails" type="geojson" data={data}>
      <Layer
        id="trail-casing"
        type="line"
        layout={{ "line-join": "round", "line-cap": "round" }}
        paint={{
          "line-color": "#ffffff",
          "line-width": ["case", isSelected, 9, 7],
          "line-opacity": selectedId ? ["case", isSelected, 1, 0.4] : 0.95,
        }}
      />
      <Layer
        id="trail-line"
        type="line"
        layout={{ "line-join": "round", "line-cap": "round" }}
        paint={{
          "line-color": ["get", "color"],
          "line-width": ["case", isSelected, 5, 3.5],
          "line-opacity": selectedId ? ["case", isSelected, 1, 0.35] : 0.9,
          "line-dasharray": ["case", ["get", "draft"], ["literal", [2, 1.5]], ["literal", [1, 0]]],
        }}
      />
      <Layer
        id="trail-arrows"
        type="symbol"
        filter={["==", ["get", "ordered"], true]}
        minzoom={13}
        layout={{
          "symbol-placement": "line",
          "symbol-spacing": 90,
          "icon-image": ARROW_IMAGE,
          "icon-size": 1.2,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        }}
        paint={{
          "icon-color": "#111827",
          "icon-halo-color": "#ffffff",
          "icon-halo-width": 1.5,
          "icon-opacity": selectedId ? ["case", isSelected, 1, 0.35] : 1,
        }}
      />
      {/* Wide and invisible: an easy target for clicks and taps. */}
      <Layer
        id={TRAIL_HIT_LAYER}
        type="line"
        paint={{ "line-color": "#000000", "line-width": 18, "line-opacity": 0 }}
      />
    </Source>
  );
}
