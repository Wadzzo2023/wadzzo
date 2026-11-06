"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import { useTheme } from "next-themes";
import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import MapGL, { useControl, useMap, type MapProps, type MapRef } from "react-map-gl/mapbox";

import { env } from "~/env";
import { MapControlStack } from "./map-control-stack";
import { MapControlStackContext } from "./map-control-stack-context";
import { UserLocationLayer } from "./user-location";
import { cn } from "@wadzzo/ui/lib/cn";

import {
  mapStyleFor,
  readMapMode,
  setMapMode,
  useIsClient,
  useMapMode,
  type MapMode,
} from "./map-mode";

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
 * The corner buttons as one box: [locate, from a child layer] 2D/3D, zoom in, zoom out.
 * `children` are rendered with the stack available through `useMapControlStack`.
 */
function MapControls({
  mode,
  position,
  children,
}: {
  mode: MapMode;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  children?: ReactNode;
}) {
  const { current } = useMap();
  const stack = useControl<MapControlStack>(() => new MapControlStack(), { position });

  // Shows the mode a click switches to, the way map apps do.
  useEffect(() => {
    const next = mode === "3d" ? "2D" : "3D";
    stack.set("mode", {
      label: `Switch to the ${next} map`,
      html: `<span style="font-size:11px;font-weight:700;letter-spacing:0.02em">${next}</span>`,
      onPress: () => setMapMode(readMapMode() === "3d" ? "2d" : "3d"),
    });
  }, [stack, mode]);

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

/**
 * The portal's one map: Mapbox, themed, with the same token everywhere.
 * Flat 2D (day / night) by default; a corner button switches every map to the
 * 3D city style and back.
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
  }
>(function BaseMap(
  {
    children,
    className,
    controls = true,
    locate = false,
    controlsPosition = "bottom-right",
    ...props
  },
  ref,
) {
  const { resolvedTheme } = useTheme();
  const mode = useMapMode();
  // Wait for the browser so the map is created with the real theme and mode;
  // swapping the style while it loads breaks Mapbox Standard.
  const mounted = useIsClient();
  if (!mounted || !resolvedTheme) return <div className={cn("relative size-full", className)} />;

  const is3d = mode === "3d";
  const { initialViewState, maxPitch, ...rest } = props;
  return (
    <div className={cn("relative size-full", className)}>
      <MapGL
        ref={ref}
        mapboxAccessToken={env.NEXT_PUBLIC_MAPBOX_API}
        mapStyle={mapStyleFor(mode, resolvedTheme === "dark" ? "dark" : "light")}
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
        {controls ? (
          <MapControls mode={mode} position={controlsPosition}>
            {locate && <UserLocationLayer />}
          </MapControls>
        ) : (
          locate && <UserLocationLayer />
        )}
        {children}
      </MapGL>
    </div>
  );
});
