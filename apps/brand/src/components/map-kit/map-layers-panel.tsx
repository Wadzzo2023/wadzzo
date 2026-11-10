"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { Label } from "@wadzzo/ui/components/label";
import { Switch } from "@wadzzo/ui/components/switch";
import { cn } from "@wadzzo/ui/lib/cn";
import { Segmented } from "@wadzzo/ui/patterns/segmented";
import { Button } from "@wadzzo/ui/poster/button";

import { env } from "~/env";

import {
  MAP_BASE_LABEL,
  MAP_BASES,
  setMapBase,
  setMapMode,
  setMapTerrain,
  useMapBase,
  useMapMode,
  useMapTerrain,
  type MapBase,
} from "./map-mode";

/** Where the previews look: the map's centre and zoom when the panel opened. */
export type PreviewView = { lng: number; lat: number; zoom: number };
/** Before the map has a view: a hilly town, where every type looks different. */
export const DEFAULT_PREVIEW: PreviewView = { lng: 8.6806, lat: 49.4105, zoom: 13.2 };

/** A small picture of each map type (its flat style) at the place being looked at. */
function previewUrl(base: MapBase, theme: "light" | "dark", v: PreviewView) {
  // Zoomed in a little less than the map, so a thumbnail shows the area around it.
  const zoom = Math.min(16, Math.max(1, v.zoom - 1)).toFixed(1);
  const style = {
    default: theme === "dark" ? "mapbox/dark-v11" : "mapbox/light-v11",
    streets: "mapbox/streets-v12",
    outdoors: "mapbox/outdoors-v12",
    satellite: "mapbox/satellite-streets-v12",
    light: "mapbox/light-v11",
    dark: "mapbox/dark-v11",
  }[base];
  return `https://api.mapbox.com/styles/v1/${style}/static/${v.lng.toFixed(4)},${v.lat.toFixed(4)},${zoom}/160x104@2x?attribution=false&logo=false&access_token=${env.NEXT_PUBLIC_MAPBOX_API}`;
}

/** The base map's Layers panel: map type, 2D / 3D and Terrain, shared by every portal map. */
export function MapLayersPanel({
  theme,
  view,
  onClose,
  className,
}: {
  theme: "light" | "dark";
  view: PreviewView;
  onClose: () => void;
  className?: string;
}) {
  const base = useMapBase();
  const mode = useMapMode();
  const terrain = useMapTerrain();
  const ref = useRef<HTMLDivElement>(null);

  // Esc or a click elsewhere closes it (not the Layers button: that toggles it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest("[data-layers-button]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Map layers"
      className={cn(
        "bg-card border-foreground/10 z-40 w-[296px] rounded-[1.2rem] border-2 p-3 shadow-xl",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="font-hud text-sm font-semibold">Map layers</p>
        <Button size="icon-sm" variant="ghost" aria-label="Close map layers" onClick={onClose}>
          <X />
        </Button>
      </div>
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
        Map type
      </p>
      <div className="mt-1.5 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Map type">
        {MAP_BASES.map((b) => {
          const on = b === base;
          return (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setMapBase(b)}
              className="text-left"
            >
              <span
                className={cn(
                  "bg-muted relative block aspect-[160/104] overflow-hidden rounded-lg border-2",
                  on ? "border-primary" : "border-transparent",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl(b, theme, view)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
                {on && (
                  <span className="bg-primary text-primary-foreground absolute top-1 right-1 flex size-4 items-center justify-center rounded-full">
                    <Check className="size-3" strokeWidth={3.5} />
                  </span>
                )}
              </span>
              <span
                className={cn("mt-0.5 block text-xs font-medium", !on && "text-muted-foreground")}
              >
                {MAP_BASE_LABEL[b]}
              </span>
            </button>
          );
        })}
      </div>
      <div className="border-foreground/10 mt-3 flex items-center justify-between gap-2 border-t pt-3">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
          View
        </span>
        <Segmented
          label="View"
          value={mode}
          onChange={setMapMode}
          options={[
            { id: "2d", label: "2D" },
            { id: "3d", label: "3D" },
          ]}
        />
      </div>
      <div className="border-foreground/10 mt-3 flex items-center justify-between gap-2 border-t pt-3">
        <div>
          <Label htmlFor="map-terrain" className="text-sm">
            Terrain
          </Label>
          <p className="text-muted-foreground text-xs">Hills and contour lines with heights</p>
        </div>
        <Switch id="map-terrain" checked={terrain} onCheckedChange={setMapTerrain} />
      </div>
    </div>
  );
}
