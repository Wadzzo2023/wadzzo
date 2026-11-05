"use client";

import type { IControl } from "mapbox-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Layer, Marker, Source, useControl, useMap } from "react-map-gl/mapbox";

import { circleFeature, toMapboxFeature } from "@wadzzo/geo/map-geometry";

type Fix = { lat: number; lng: number; accuracy: number };
type Status = "idle" | "locating" | "located" | "denied";

/** Zoom the camera settles at when it flies to the user, unless the map is already closer. */
const LOCATE_ZOOM = 15.5;

const ICON_PATHS = `
  <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"></circle>
  <circle cx="12" cy="12" r="7"></circle>
  <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"></path>`;

/** A button in the map's corner, next to the zoom buttons, that flies to the viewer's location. */
class LocateControl implements IControl {
  private el?: HTMLDivElement;
  private button?: HTMLButtonElement;
  private onPress: () => void = () => undefined;

  /** The React side's handler for a press of the button. */
  setOnPress(handler: () => void) {
    this.onPress = handler;
  }

  onAdd() {
    const el = document.createElement("div");
    el.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
    const button = document.createElement("button");
    button.type = "button";
    button.style.color = "#111";
    button.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${ICON_PATHS}</svg>`;
    button.addEventListener("click", () => this.onPress());
    el.appendChild(button);
    this.el = el;
    this.button = button;
    this.show("idle");
    return el;
  }

  onRemove() {
    this.el?.remove();
  }

  show(status: Status) {
    if (!this.button) return;
    const label =
      status === "denied"
        ? "Location is blocked — allow it in your browser settings"
        : status === "locating"
          ? "Finding your location…"
          : "Show my location";
    this.button.title = label;
    this.button.setAttribute("aria-label", label);
    // Blue once there is a fix, dimmed when the browser refused, pulsing while waiting.
    this.button.style.color = status === "located" ? "#2f7cf6" : "#111";
    this.button.style.opacity = status === "denied" ? "0.45" : "1";
    this.button.style.animation = status === "locating" ? "pulse 1.2s ease-in-out infinite" : "";
  }
}

/**
 * "Where am I" for a map: the blue puck at the viewer's position (with its accuracy circle) and a
 * button that flies to it. The button is the one that asks the browser for permission; if it was
 * already granted the puck shows by itself, without moving the camera, so a map the brand has
 * positioned stays where they left it.
 */
export function UserLocationLayer({
  position,
}: {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}) {
  const { current: map } = useMap();
  const [fix, setFix] = useState<Fix | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const watchId = useRef<number | null>(null);
  /** Fly to the next fix: set when the button was pressed before one had arrived. */
  const flyOnFix = useRef(false);
  const fixRef = useRef<Fix | null>(null);

  const flyTo = useCallback(
    (f: Fix) => {
      const m = map?.getMap();
      if (!m) return;
      m.flyTo({
        center: [f.lng, f.lat],
        zoom: Math.max(m.getZoom(), LOCATE_ZOOM),
        duration: 700,
      });
    },
    [map],
  );

  const stopWatching = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const startWatching = useCallback(() => {
    if (watchId.current !== null) return;
    if (!("geolocation" in navigator)) {
      setStatus("denied");
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const f = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        fixRef.current = f;
        setFix(f);
        setStatus("located");
        if (flyOnFix.current) {
          flyOnFix.current = false;
          flyTo(f);
        }
      },
      (err) => {
        flyOnFix.current = false;
        stopWatching();
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("denied");
          toast.error("Location is blocked. Allow it in your browser's site settings to use this.");
        } else {
          // No signal right now: keep what we have, let the next press try again.
          setStatus(fixRef.current ? "located" : "idle");
          toast.error("Couldn't find your location. Try again in a moment.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  }, [flyTo, stopWatching]);

  // Already allowed on this site: show the puck without asking and without moving the camera.
  useEffect(() => {
    let cancelled = false;
    void navigator.permissions
      ?.query({ name: "geolocation" })
      .then((result) => {
        if (cancelled) return;
        if (result.state === "granted") startWatching();
        else if (result.state === "denied") setStatus("denied");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stopWatching();
    };
  }, [startWatching, stopWatching]);

  const control = useControl<LocateControl>(() => new LocateControl(), { position });
  useEffect(() => {
    control.setOnPress(() => {
      if (fixRef.current) {
        flyTo(fixRef.current);
        return;
      }
      if (status === "denied") {
        toast.error("Location is blocked. Allow it in your browser's site settings to use this.");
        return;
      }
      flyOnFix.current = true;
      setStatus("locating");
      startWatching();
    });
  }, [control, flyTo, startWatching, status]);
  useEffect(() => control.show(status), [control, status]);

  const accuracy = useMemo(
    () =>
      fix && fix.accuracy >= 20
        ? toMapboxFeature(
            circleFeature(fix, {
              lat: fix.lat + (Math.min(fix.accuracy, 2000) / 6_371_000) * (180 / Math.PI),
              lng: fix.lng,
            }),
          )
        : null,
    [fix],
  );

  if (!fix) return null;
  return (
    <>
      {accuracy && (
        <Source id="user-accuracy" type="geojson" data={accuracy}>
          <Layer
            id="user-accuracy-fill"
            type="fill"
            paint={{ "fill-color": "#2f7cf6", "fill-opacity": 0.12 }}
          />
          <Layer
            id="user-accuracy-line"
            type="line"
            paint={{ "line-color": "#2f7cf6", "line-opacity": 0.35, "line-width": 1 }}
          />
        </Source>
      )}
      {/* `pointer-events: none`: the puck is a read-out, a click on it is a click on the map. */}
      <Marker
        longitude={fix.lng}
        latitude={fix.lat}
        anchor="center"
        style={{ pointerEvents: "none", zIndex: 4 }}
      >
        <span role="img" aria-label="Your location" className="relative flex size-5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#2f7cf6] opacity-40" />
          <span className="relative inline-flex size-5 rounded-full border-[3px] border-white bg-[#2f7cf6] shadow-[0_1px_4px_rgba(0,0,0,0.5)]" />
        </span>
      </Marker>
    </>
  );
}
