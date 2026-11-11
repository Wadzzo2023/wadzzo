"use client";

import { motion } from "framer-motion";
import { Check, Layers } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useMap } from "react-map-gl/mapbox";

import { cn } from "@wadzzo/ui/lib/cn";

import { BottomSheet } from "~/components/ui/BottomSheet";
import {
  MAP_BASE_LABEL,
  MAP_BASES,
  setMapBase,
  setMapMode,
  setMapTerrain,
  useMapBase,
  useMapMode,
  useMapTerrain,
  useResolvedTheme,
  type MapBase,
  type ResolvedTheme,
} from "~/lib/ar/theme";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API;

const noSubscribe = () => () => undefined;

/** Where the previews look: the last map's centre and zoom (a hilly town before any map). */
type PreviewView = { lng: number; lat: number; zoom: number };
let lastView: PreviewView = { lng: 8.6806, lat: 49.4105, zoom: 13.2 };

/** Inside a map: keeps `lastView` up to date, so the Layers sheet previews this place. */
export function MapViewProbe() {
  const { current } = useMap();
  useEffect(() => {
    const map = current?.getMap();
    if (!map) return;
    const save = () => {
      const c = map.getCenter();
      lastView = { lng: c.lng, lat: c.lat, zoom: map.getZoom() };
    };
    save();
    map.on("moveend", save);
    return () => void map.off("moveend", save);
  }, [current]);
  return null;
}

/** A small picture of each map type (its flat style) at the place being looked at. */
function previewUrl(base: MapBase, theme: ResolvedTheme, v: PreviewView) {
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
  return `https://api.mapbox.com/styles/v1/${style}/static/${v.lng.toFixed(4)},${v.lat.toFixed(4)},${zoom}/160x104@2x?attribution=false&logo=false&access_token=${MAPBOX_TOKEN}`;
}

/**
 * The Layers button (a map's control rail, or alone in glass) and its sheet: the map type,
 * 2D / 3D and Terrain. Every map in the app shares the choice.
 */
export function MapLayersButton({
  bare = false,
  className,
}: {
  bare?: boolean;
  className?: string;
}) {
  // Opened at the place on screen right now (the previews show it).
  const [at, setAt] = useState<PreviewView | null>(null);
  // Only in the browser (the portal needs the document; the server renders no sheet).
  const client = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  return (
    <>
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={() => setAt(lastView)}
        aria-label="Map layers"
        title="Map layers"
        className={cn(
          "text-ar-dim hover:text-ar-text pointer-events-auto flex h-11 w-11 items-center justify-center transition-colors",
          !bare && "ar-glass rounded-full",
          className,
        )}
      >
        <Layers size={18} strokeWidth={2.1} />
      </motion.button>
      {/* Into the phone screen, not here: a sheet fills its nearest positioned box, and the
          map rail (absolute, translated) would squeeze it into the button's capsule. */}
      {client &&
        createPortal(
          <MapLayersSheet open={at !== null} view={at ?? lastView} onClose={() => setAt(null)} />,
          document.querySelector("[data-ar-app-frame]") ?? document.body,
        )}
    </>
  );
}

export function MapLayersSheet({
  open,
  view,
  onClose,
}: {
  open: boolean;
  view: PreviewView;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="map-layers-title">
      <div className="px-5 pt-1 pb-3">
        <h2 id="map-layers-title" className="font-hud text-ar-text text-[16px] font-bold">
          Map layers
        </h2>
        <MapStyleOptions view={view} />
      </div>
    </BottomSheet>
  );
}

/** Where the map was last looked at, for the map type previews (Settings has no map). */
export function lastMapView(): PreviewView {
  return lastView;
}

/**
 * The map type (with a preview of each at `view`), 2D / 3D and Terrain. In the map style sheet
 * (trail and directions maps) and under Map in Settings; every map in the app shares the choice.
 */
export function MapStyleOptions({ view }: { view: PreviewView }) {
  const base = useMapBase();
  const mode = useMapMode();
  const terrain = useMapTerrain();
  const theme = useResolvedTheme();
  const label = "font-hud text-ar-faint text-[10px] font-semibold tracking-[0.2em] uppercase";
  return (
    <>
      <p className={cn(label, "mt-4")}>Map type</p>
      <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Map type">
        {MAP_BASES.map((b) => {
          const on = b === base;
          return (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setMapBase(b)}
              className="group text-left"
            >
              <span
                className={cn(
                  "relative block aspect-[160/104] overflow-hidden rounded-[12px] border-2 bg-white/5",
                  on ? "border-ar-green-hot" : "border-transparent",
                )}
              >
                {MAPBOX_TOKEN && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl(b, theme, view)}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                )}
                {on && (
                  <span className="bg-ar-green-hot absolute top-1 right-1 flex size-4 items-center justify-center rounded-full text-black">
                    <Check size={11} strokeWidth={3.5} />
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "mt-1 block text-[11.5px] font-semibold",
                  on ? "text-ar-green-hot" : "text-ar-dim",
                )}
              >
                {MAP_BASE_LABEL[b]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-ar-line mt-4 flex items-center justify-between gap-3 border-t pt-4">
        <div>
          <p className={label}>View</p>
          <p className="text-ar-dim mt-0.5 text-[11.5px]">
            3D tilts the map
            {base === "default" || base === "streets" || base === "satellite"
              ? " and raises buildings"
              : ""}
          </p>
        </div>
        <div className="ar-bevel flex rounded-full p-0.5" role="radiogroup" aria-label="View">
          {(["2d", "3d"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMapMode(m)}
              className={cn(
                "font-hud h-8 w-12 rounded-full text-[12px] font-bold",
                mode === m ? "bg-ar-green-hot text-black" : "text-ar-dim",
              )}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="border-ar-line mt-4 flex items-center justify-between gap-3 border-t pt-4">
        <div>
          <p className={label}>Terrain</p>
          <p className="text-ar-dim mt-0.5 text-[11.5px]">Hills and contour lines with heights</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={terrain}
          aria-label="Terrain"
          onClick={() => setMapTerrain(!terrain)}
          className={cn(
            "relative h-7 w-12 rounded-full transition-colors",
            terrain ? "bg-ar-green-hot" : "bg-white/15",
          )}
        >
          <span
            className={cn(
              "absolute top-1 size-5 rounded-full bg-white shadow transition-[left]",
              terrain ? "left-6" : "left-1",
            )}
          />
        </button>
      </div>
    </>
  );
}
