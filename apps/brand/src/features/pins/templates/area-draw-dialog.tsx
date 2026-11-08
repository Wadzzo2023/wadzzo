"use client";

import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";

import {
  areaBounds,
  toMapboxFeature,
  type DrawShape,
  type StoredFeature,
} from "@wadzzo/geo/map-geometry";
import { Dialog, DialogContent, DialogTitle } from "@wadzzo/ui/poster/dialog";

import { BaseMap, WORLD_VIEW } from "~/components/map-kit/base-map";
import { DrawTool } from "~/components/map-kit/draw-tool";

/**
 * Draw (or redraw) a hotspot area without leaving the form: the map's draw
 * tool in a dialog, starting on the current area if there is one. The form
 * behind it keeps everything the brand has filled in.
 */
export function AreaDrawDialog({
  open,
  onOpenChange,
  current,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: { feature: StoredFeature; shape: DrawShape } | null;
  onDone: (feature: StoredFeature, shape: DrawShape) => void;
}) {
  const bounds = useMemo(() => (current ? areaBounds([current.feature]) : null), [current]);
  const outline = useMemo(() => (current ? toMapboxFeature(current.feature) : null), [current]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(85dvh,720px)] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogTitle className="sr-only">Draw the hotspot area</DialogTitle>
        {open && (
          <div className="relative size-full">
            <BaseMap
              initialViewState={
                bounds
                  ? { bounds: [...bounds[0], ...bounds[1]], fitBoundsOptions: { padding: 80 } }
                  : WORLD_VIEW
              }
              locate
            >
              {outline && (
                <Source id="area-current" type="geojson" data={outline}>
                  <Layer
                    id="area-current-line"
                    type="line"
                    paint={{ "line-color": "#64748b", "line-width": 1.5, "line-dasharray": [2, 2] }}
                  />
                </Source>
              )}
              <DrawTool
                initialShape={current?.shape ?? "polygon"}
                title={current ? "Redraw the area" : "Draw the area"}
                onCancel={() => onOpenChange(false)}
                onDone={(f, shape) => {
                  onDone(f, shape);
                  onOpenChange(false);
                }}
              />
            </BaseMap>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
