import { CircleLayer, LineLayer, ShapeSource, SymbolLayer } from "@rnmapbox/maps";
import { useMemo } from "react";

import type { ArTrail } from "~/lib/api/types";
import { trailColor, trailLines } from "~/lib/ar/trails";

/**
 * The followed trail on the map (docs/trails, "Follow mode"): its path in the
 * trail's colour (walked sections dimmed) and a numbered dot under each stop's
 * pin. Drawn below the pin markers, which stay the things you tap.
 */
export function TrailMapLine({ trail, onStop }: { trail: ArTrail; /** A stop's dot tapped (the trail page). */ onStop?: (position: number) => void }) {
  const color = trailColor(trail);
  const lines = useMemo(() => trailLines(trail), [trail]);
  const stops = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: trail.stops.map((s) => ({
        type: "Feature",
        properties: { n: String(s.position), done: s.done, required: s.required },
        geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      })),
    }),
    [trail],
  );

  return (
    <>
      <ShapeSource id="trail-path" shape={lines}>
        <LineLayer id="trail-casing" style={{ lineColor: "#ffffff", lineWidth: 7, lineOpacity: 0.85, lineCap: "round", lineJoin: "round", lineEmissiveStrength: 1 }} />
        <LineLayer
          id="trail-line"
          style={{
            lineColor: color,
            lineWidth: 4,
            lineOpacity: ["case", ["get", "done"], 0.45, 1],
            lineCap: "round",
            lineJoin: "round",
            lineEmissiveStrength: 1,
          }}
        />
      </ShapeSource>
      <ShapeSource
        id="trail-stops"
        shape={stops}
        onPress={
          onStop &&
          ((e) => {
            const n = Number(e.features[0]?.properties?.n);
            if (Number.isFinite(n)) onStop(n);
          })
        }
      >
        <CircleLayer
          id="trail-stop-dot"
          style={{
            circleRadius: 9,
            circleColor: ["case", ["get", "required"], color, "#8a948f"],
            circleOpacity: ["case", ["get", "done"], 0.5, 1],
            circleStrokeColor: "#ffffff",
            circleStrokeWidth: 2,
            circleEmissiveStrength: 1,
          }}
        />
        <SymbolLayer
          id="trail-stop-n"
          style={{ textField: ["get", "n"], textSize: 10, textColor: "#ffffff", textAllowOverlap: true, textIgnorePlacement: true }}
        />
      </ShapeSource>
    </>
  );
}
