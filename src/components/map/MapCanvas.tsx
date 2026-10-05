import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import MapGL, { Marker, type MapRef, type ViewStateChangeEvent } from "react-map-gl";

import { AR_CAPTURE_RADIUS, distanceMeters } from "~/lib/ar/geo";
import type { ArPin, Coords, GeoFix } from "~/lib/ar/types";
import {
  MAP_STYLE,
  type ResolvedTheme,
  useResolvedTheme,
} from "~/lib/ar/theme";
import { cn } from "~/lib/utils";
import { MuralMarker, type MapMural } from "./MuralMarker";
import { PinMarker } from "./PinMarker";
import { metersPerPixel, UserPuck } from "./UserPuck";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API;

/**
 * ── MapCanvas ──────────────────────────────────────────────────────────────
 *
 * Mapbox with the app's chrome removed and its own colour graded on top:
 * `dark-v11` or `light-v11` as the base depending on the live theme, a green
 * wash and a faint terrain grid over it, and a vignette so the edges fall
 * away toward the device bezel. The stock styles are blue-grey and read as
 * "a map"; this reads as the app.
 *
 * Follow mode is the interesting behaviour. While `following` is true the
 * camera eases to every new fix, so a puck on the move stays centred — that's
 * the running/driving case. The moment the viewer drags, follow is released
 * (the map page listens for `onDragStart`) and stays released until they
 * press recenter. Nothing is more annoying than a map that fights you back to
 * centre while you're trying to look at the next street over.
 */

export interface MapCanvasHandle {
  recenter: (coords: Coords, opts?: { zoom?: number }) => void;
  flyToPin: (pin: ArPin) => void;
  flyToMural: (mural: MapMural) => void;
  /** Turn the map back to north — used when compass mode is switched off. */
  resetBearing: () => void;
}

interface Props {
  pins: ArPin[];
  fix: GeoFix | null;
  center: Coords;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  following: boolean;
  onUserPan: () => void;
  /**
   * Rotate the map to the viewer's heading instead of holding north up — the
   * "Compass map" setting. Null when the compass is off or unavailable, which
   * leaves the map's bearing exactly as the viewer left it.
   */
  headingUp: number | null;
  /** Murals layer (plan §7). Omitted = no murals drawn. */
  murals?: MapMural[];
  muralDailyLimit?: number;
  selectedMuralId?: string | null;
  onSelectMural?: (id: string) => void;
  /** The visible area, on load and after every pan/zoom settles. */
  onBoundsChange?: (b: { north: number; south: number; east: number; west: number }) => void;
}

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(
  {
    pins,
    fix,
    center,
    selectedId,
    onSelect,
    following,
    onUserPan,
    headingUp,
    murals,
    muralDailyLimit = 3,
    selectedMuralId,
    onSelectMural,
    onBoundsChange,
  },
  ref,
) {
  const mapRef = useRef<MapRef | null>(null);
  const lastBearing = useRef<number | null>(null);
  const [zoom, setZoom] = useState(16.4);
  const [ready, setReady] = useState(false);
  const theme = useResolvedTheme();

  // Imperative handle rather than prop-driven view state: a controlled
  // viewState re-renders every marker on every frame of a pan.
  const recenter = useCallback((coords: Coords, opts?: { zoom?: number }) => {
    mapRef.current?.easeTo({
      center: [coords.lng, coords.lat],
      zoom: opts?.zoom ?? 16.8,
      duration: 900,
      essential: true,
    });
  }, []);

  const flyTo = useCallback((lat: number, lng: number) => {
    mapRef.current?.easeTo({
      center: [lng, lat],
      zoom: 17.6,
      // Nudge the target above centre so the detail sheet doesn't cover it.
      offset: [0, -110],
      duration: 800,
      essential: true,
    });
  }, []);
  const flyToPin = useCallback((pin: ArPin) => flyTo(pin.lat, pin.lng), [flyTo]);
  const flyToMural = useCallback((m: MapMural) => flyTo(m.latitude, m.longitude), [flyTo]);

  const resetBearing = useCallback(() => {
    lastBearing.current = null;
    mapRef.current?.easeTo({ bearing: 0, duration: 500, essential: true });
  }, []);

  useEffect(() => {
    if (typeof ref === "function") ref({ recenter, flyToPin, flyToMural, resetBearing });
    else if (ref) ref.current = { recenter, flyToPin, flyToMural, resetBearing };
  }, [ref, recenter, flyToPin, flyToMural, resetBearing]);

  // Follow the fix while the viewer hasn't taken the wheel.
  useEffect(() => {
    if (!following || !fix || !ready) return;
    mapRef.current?.easeTo({
      center: [fix.lng, fix.lat],
      duration: 850,
      essential: true,
    });
  }, [following, fix, ready]);

  /**
   * Compass mode: turn the map under a fixed "up".
   *
   * Mapbox bearing is the compass direction shown at the top of the screen, so
   * heading-up means bearing === heading. Eased rather than set, and only past
   * a threshold, for the same reason the AR compass is smoothed: a raw
   * magnetometer feed re-rendering every marker on every degree of noise makes
   * a map that visibly shivers while the phone sits still.
   *
   * 2° is comfortably above the sensor's resting jitter and well below what
   * reads as a deliberate turn.
   */
  useEffect(() => {
    if (headingUp == null || !ready) return;

    const previous = lastBearing.current;
    if (previous != null) {
      const delta = Math.abs(((headingUp - previous + 540) % 360) - 180);
      if (delta < 2) return;
    }
    lastBearing.current = headingUp;

    mapRef.current?.easeTo({
      bearing: headingUp,
      duration: 260,
      essential: true,
    });
  }, [headingUp, ready]);

  const onMove = (e: ViewStateChangeEvent) => setZoom(e.viewState.zoom);
  const reportBounds = () => {
    const b = mapRef.current?.getBounds();
    if (b && onBoundsChange) onBoundsChange({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
  };

  if (!MAPBOX_TOKEN) {
    return <MapFallback pins={pins} onSelect={onSelect} selectedId={selectedId} />;
  }

  const mpp = metersPerPixel(fix?.lat ?? center.lat, zoom);

  return (
    <div className="absolute inset-0">
      <MapGL
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{
          longitude: center.lng,
          latitude: center.lat,
          zoom: 16.4,
          pitch: 48,
          bearing: -14,
        }}
        mapStyle={MAP_STYLE[theme]}
        attributionControl={false}
        onLoad={() => {
          setReady(true);
          reportBounds();
        }}
        onMove={onMove}
        onMoveEnd={reportBounds}
        onDragStart={onUserPan}
        onClick={() => onSelect(null)}
        // A pitched map with 3D extrusions is what makes a city read as a
        // place rather than a street diagram — worth the extra tiles.
        maxPitch={62}
        minZoom={11}
        maxZoom={19.5}
        reuseMaps
        style={{ width: "100%", height: "100%" }}
      >
        {murals?.map((m) => (
          <Marker
            key={`mural-${m.id}`}
            longitude={m.longitude}
            latitude={m.latitude}
            anchor="bottom"
            style={{ zIndex: m.id === selectedMuralId ? 20 : 9 }}
          >
            <MuralMarker
              mural={m}
              dailyLimit={muralDailyLimit}
              selected={m.id === selectedMuralId}
              onSelect={() => onSelectMural?.(m.id)}
            />
          </Marker>
        ))}

        {pins.map((pin) => (
          <Marker
            key={pin.id}
            longitude={pin.lng}
            latitude={pin.lat}
            anchor="bottom"
            style={{ zIndex: pin.id === selectedId ? 20 : 10 }}
          >
            <PinMarker
              pin={pin}
              selected={pin.id === selectedId}
              inRange={
                fix
                  ? distanceMeters(fix, pin) <= AR_CAPTURE_RADIUS
                  : false
              }
              onSelect={() => onSelect(pin.id)}
            />
          </Marker>
        ))}

        {fix && (
          // Above every pin (10, selected 20): pins bunched around the user
          // must never cover where they are. Click-through, so it can't
          // block the pins it overlaps.
          <Marker
            longitude={fix.lng}
            latitude={fix.lat}
            anchor="center"
            style={{ zIndex: 30, pointerEvents: "none" }}
          >
            <UserPuck fix={fix} metersPerPixel={mpp} />
          </Marker>
        )}
      </MapGL>

      <MapGrade theme={theme} />
    </div>
  );
});

/**
 * Colour grade over the tiles — the grid ties the map to the rest of the UI,
 * and the vignette lets the map fall off into the bezel instead of stopping
 * at a hard edge.
 *
 * The tint itself has to flip with the theme, because a blend mode isn't
 * symmetric. The dark grade leans on `multiply` with a deep green, which can
 * only ever *darken* what's beneath it — correct over `dark-v11`, but over
 * the light basemap it dragged the whole map toward a muddy sage and buried
 * exactly the street names this grade is supposed to leave readable. Light
 * mode uses `screen` with the same hue instead, the mirror operation: it can
 * only lighten, so it lifts the tiles toward the page's off-white and tints
 * them without darkening anything.
 */
function MapGrade({ theme }: { theme: ResolvedTheme }) {
  const dark = theme === "dark";

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* Kept light on purpose: the grade should tint the tiles, not bury
          them. Street names are wayfinding, and a collector walking to a pin
          needs to read them. */}
      <div
        className={cn(
          "absolute inset-0",
          dark
            ? "bg-[hsl(152_60%_10%)] opacity-30 mix-blend-multiply"
            : "bg-[hsl(140_45%_92%)] opacity-[0.22] mix-blend-screen",
        )}
      />
      <div
        className={cn(
          "absolute inset-0 bg-[hsl(115_70%_48%)] mix-blend-overlay",
          dark ? "opacity-[0.13]" : "opacity-[0.07]",
        )}
      />
      <div
        className={cn(
          "ar-grid absolute inset-0",
          dark ? "opacity-[0.18]" : "opacity-[0.1]",
        )}
      />
      {/* Vignette, held back in light mode. `--ar-void` is near-black in dark
          and near-white in light, so the same 0.72 that gently fades the map
          into the bezel at night becomes a heavy white bloom in daylight —
          washing out the edges of exactly the map someone is trying to read in
          the sun. Half the strength keeps the falloff without the haze. */}
      <div
        className={cn(
          "absolute inset-0",
          dark
            ? "bg-[radial-gradient(120%_85%_at_50%_46%,transparent_52%,hsl(var(--ar-void)/0.72)_100%)]"
            : "bg-[radial-gradient(120%_85%_at_50%_46%,transparent_62%,hsl(var(--ar-void)/0.38)_100%)]",
        )}
      />
    </div>
  );
}

/**
 * Shown when NEXT_PUBLIC_MAPBOX_API is missing. A radar sweep over the grid
 * with the pins laid out by bearing — enough to review the markers, the
 * controls, and the sheet without a token, and unmistakably not a real map.
 */
function MapFallback({
  pins,
  selectedId,
  onSelect,
}: {
  pins: ArPin[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="ar-grid absolute inset-0 overflow-hidden bg-ar-bg">
      <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-ar-green/20" />
      <div className="absolute left-1/2 top-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-ar-green/25" />
      <div className="absolute left-1/2 top-1/2 h-[160px] w-[160px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-ar-green/30" />
      <div
        className="animate-spin-slow absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, hsl(var(--ar-green)/0.28) 40deg, transparent 70deg)",
        }}
      />

      {pins.slice(0, 10).map((pin, i) => {
        const angle = (i / 10) * Math.PI * 2;
        const radius = 32 + (i % 3) * 12;
        return (
          <div
            key={pin.id}
            className="absolute"
            style={{
              left: `${50 + Math.cos(angle) * radius * 0.7}%`,
              top: `${46 + Math.sin(angle) * radius * 0.55}%`,
              transform: "translate(-50%,-50%)",
            }}
          >
            <PinMarker
              pin={pin}
              selected={pin.id === selectedId}
              inRange={i < 3}
              onSelect={() => onSelect(pin.id)}
            />
          </div>
        );
      })}

      <div
        className={cn(
          "ar-glass absolute inset-x-5 top-1/2 -translate-y-1/2 rounded-ar px-4 py-3 text-center",
        )}
      >
        <p className="font-hud text-[11px] font-semibold uppercase tracking-[0.18em] text-ar-green">
          Map preview
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-ar-dim">
          Set <code className="text-ar-text">NEXT_PUBLIC_MAPBOX_API</code> to
          load live tiles.
        </p>
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(115%_80%_at_50%_46%,transparent_35%,hsl(var(--ar-void)/0.92)_100%)]" />
    </div>
  );
}
