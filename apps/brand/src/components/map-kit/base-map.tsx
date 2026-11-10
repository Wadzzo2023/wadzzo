"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import { useTheme } from "next-themes";
import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import MapGL, { useControl, useMap, type MapProps, type MapRef } from "react-map-gl/mapbox";

import { env } from "~/env";
import { MapControlStack } from "./map-control-stack";
import { MapControlStackContext } from "./map-control-stack-context";
import { DEFAULT_PREVIEW, MapLayersPanel, type PreviewView } from "./map-layers-panel";
import { MapTerrain } from "./map-terrain";
import { UserLocationLayer } from "./user-location";
import { cn } from "@wadzzo/ui/lib/cn";

import type { IControl } from "mapbox-gl";

import { mapStyleFor, useIsClient, useMapBase, useMapMode, type MapMode } from "./map-mode";

/** Lucide's "layers" icon, for the Layers button (plain HTML). */
const LAYERS_ICON =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin:auto"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></svg>';

export { MAP_STYLE_2D, MAP_STYLE_3D } from "./map-mode";

/** How far the 3D map is tilted by default, and the most it can be tilted. */
const TILT_3D = 45;
const MAX_PITCH_3D = 62;

export const WORLD_VIEW = { latitude: 22.55, longitude: 0, zoom: 2.4 };

/**
 * Mapbox only resizes its canvas with the window. Keep it filling its box when
 * the box itself changes size (layout settling, panels opening), or part of the
 * map stays blank.
 */
function FollowContainerSize() {
  const { current } = useMap();
  useEffect(() => {
    const map = current?.getMap();
    if (!map) return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [current]);
  return null;
}

/** Tilts the map for 3D and lays it flat for 2D when the mode is switched. */
function ApplyMapMode({ mode }: { mode: MapMode }) {
  const { current } = useMap();
  const first = useRef(true);
  useEffect(() => {
    // The first run is the initial mode, which the map was created with.
    if (first.current) {
      first.current = false;
      return;
    }
    const map = current?.getMap();
    if (!map) return;
    // The map's maxPitch prop only catches up after this effect, and a flat
    // map clamps any tilt to 0 — raise the limit first.
    map.setMaxPitch(mode === "3d" ? MAX_PITCH_3D : 0);
    map.easeTo({ pitch: mode === "3d" ? TILT_3D : 0, duration: 500 });
  }, [current, mode]);
  return null;
}

/**
 * The corner buttons as one box: [locate, from a child layer] zoom in, zoom out. The Layers
 * button is its own box beside it (LayersControl).
 * `children` are rendered with the stack available through `useMapControlStack`.
 */
function MapControls({
  position,
  children,
}: {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  children?: ReactNode;
}) {
  const { current } = useMap();
  const stack = useControl<MapControlStack>(() => new MapControlStack(), { position });

  useEffect(() => {
    const map = current?.getMap();
    const icon = '<span class="mapboxgl-ctrl-icon" aria-hidden="true"></span>';
    const update = () => {
      stack.set("zoomIn", {
        label: "Zoom in",
        html: icon,
        className: "mapboxgl-ctrl-zoom-in",
        onPress: () => map?.zoomIn(),
        disabled: map ? map.getZoom() >= map.getMaxZoom() : false,
      });
      stack.set("zoomOut", {
        label: "Zoom out",
        html: icon,
        className: "mapboxgl-ctrl-zoom-out",
        onPress: () => map?.zoomOut(),
        disabled: map ? map.getZoom() <= map.getMinZoom() : false,
      });
    };
    update();
    // Zoom buttons switch off at the ends of the zoom range, as Mapbox's own do.
    map?.on("zoomend", update);
    return () => void map?.off("zoomend", update);
  }, [stack, current]);

  return (
    <MapControlStackContext.Provider value={stack}>{children}</MapControlStackContext.Provider>
  );
}

/** The Layers button: its own box, next to (above, in a bottom corner) the zoom buttons. */
class LayersControl implements IControl {
  private el?: HTMLDivElement;
  constructor(private readonly press: { current: () => void }) {}
  onAdd() {
    const el = document.createElement("div");
    el.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
    const button = document.createElement("button");
    button.type = "button";
    button.title = "Map layers";
    button.setAttribute("aria-label", "Map layers");
    button.setAttribute("data-layers-button", "");
    button.innerHTML = LAYERS_ICON;
    // Laid out and coloured like the zoom buttons (see MapControlStack).
    button.style.display = "flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.color = "#111";
    button.addEventListener("click", () => this.press.current());
    el.appendChild(button);
    this.el = el;
    return el;
  }
  onRemove() {
    this.el?.remove();
  }
}

function LayersButton({
  position,
  onPress,
}: {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  onPress: () => void;
}) {
  const press = useRef(onPress);
  useEffect(() => {
    press.current = onPress;
  });
  useControl(() => new LayersControl(press), { position });
  return null;
}

/**
 * The portal's one map: Mapbox, themed, with the same token everywhere.
 * Flat 2D (day / night) by default; the Layers button by the zoom buttons picks the map type
 * (Default, Streets, Outdoors, Satellite, Light, Dark), 2D / 3D and terrain for every map.
 * Children are react-map-gl layers/markers/controls.
 */
export const BaseMap = forwardRef<
  MapRef,
  Omit<MapProps, "mapboxAccessToken" | "mapStyle"> & {
    children?: ReactNode;
    className?: string;
    controls?: boolean;
    /** Add a "show my location" button and the blue puck at the viewer's position. */
    locate?: boolean;
    controlsPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    /** Show terrain whatever the Layers choice (a Hike trail being built). */
    forceTerrain?: boolean;
  }
>(function BaseMap(
  {
    children,
    className,
    controls = true,
    locate = false,
    controlsPosition = "bottom-right",
    forceTerrain = false,
    ...props
  },
  ref,
) {
  const { resolvedTheme } = useTheme();
  const mode = useMapMode();
  const base = useMapBase();
  // The Layers panel, opened at the current view (its previews show this place).
  const [layersAt, setLayersAt] = useState<PreviewView | null>(null);
  const inner = useRef<MapRef | null>(null);
  const setRef = (m: MapRef | null) => {
    inner.current = m;
    if (typeof ref === "function") ref(m);
    else if (ref) ref.current = m;
  };
  const toggleLayers = () =>
    setLayersAt((open) => {
      if (open) return null;
      const m = inner.current;
      const c = m?.getCenter();
      return c ? { lng: c.lng, lat: c.lat, zoom: m!.getZoom() } : DEFAULT_PREVIEW;
    });
  // Wait for the browser so the map is created with the real theme and mode;
  // swapping the style while it loads breaks Mapbox Standard.
  const mounted = useIsClient();
  if (!mounted || !resolvedTheme) return <div className={cn("relative size-full", className)} />;

  const is3d = mode === "3d";
  const { initialViewState, maxPitch, ...rest } = props;
  return (
    <div className={cn("relative size-full", className)}>
      <MapGL
        ref={setRef}
        mapboxAccessToken={env.NEXT_PUBLIC_MAPBOX_API}
        mapStyle={mapStyleFor(mode, resolvedTheme === "dark" ? "dark" : "light", base)}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
        minZoom={1.5}
        maxZoom={20}
        initialViewState={
          initialViewState
            ? is3d
              ? { pitch: TILT_3D, ...initialViewState }
              : { ...initialViewState, pitch: 0 }
            : undefined
        }
        maxPitch={is3d ? (maxPitch ?? MAX_PITCH_3D) : 0}
        {...rest}
      >
        <FollowContainerSize />
        <ApplyMapMode mode={mode} />
        <MapTerrain force={forceTerrain} />
        {controls ? (
          <>
            <MapControls position={controlsPosition}>{locate && <UserLocationLayer />}</MapControls>
            <LayersButton position={controlsPosition} onPress={toggleLayers} />
          </>
        ) : (
          locate && <UserLocationLayer />
        )}
        {children}
      </MapGL>
      {layersAt && (
        <MapLayersPanel
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          view={layersAt}
          onClose={() => setLayersAt(null)}
          className={cn(
            "absolute",
            controlsPosition.startsWith("top") ? "top-3" : "bottom-3",
            controlsPosition.endsWith("left") ? "left-16" : "right-16",
          )}
        />
      )}
    </div>
  );
});
