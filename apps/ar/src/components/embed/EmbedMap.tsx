import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import MapGL, { Marker, type MapRef } from "react-map-gl/mapbox";
import Supercluster from "supercluster";

import { MuralMarker, type MapMural } from "~/components/map/MuralMarker";
import { PinMarker } from "~/components/map/PinMarker";
import { distanceMeters } from "~/lib/ar/geo";
import { mapStyleFor, useMapMode, useResolvedTheme, useThemeRead } from "~/lib/ar/theme";
import type { ArPin, Coords } from "~/lib/ar/types";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API;

export interface EmbedMapHandle {
  flyTo: (coords: Coords, zoom?: number) => void;
  flyToPin: (pin: ArPin) => void;
  zoomBy: (delta: number) => void;
}

export interface Viewport {
  center: Coords;
  /** Half the view's diagonal — the radius that covers everything on screen. */
  radiusKm: number;
  zoom: number;
}

type Bounds = [number, number, number, number];

/** Below this a street of murals is a smear of frames; pins carry the view. */
const MURAL_MIN_ZOOM = 12;

/**
 * ── EmbedMap ───────────────────────────────────────────────────────────────
 *
 * The website embed's map. Deliberately not the app's `MapCanvas`: that one is
 * pitched for AR, floored at street zoom and draws every pin as a marker. A
 * map in a county website's hero has to open flat on a whole region, so pins
 * cluster (supercluster) until you zoom in, and scrolling the page past it
 * must not zoom it — `cooperativeGestures` is Mapbox's own Ctrl/⌘-to-zoom,
 * two-fingers-to-pan mode, with its own hint overlay.
 */
export const EmbedMap = forwardRef<
  EmbedMapHandle,
  {
    pins: ArPin[];
    initial: { center: Coords; zoom: number };
    cooperative: boolean;
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onViewport: (v: Viewport) => void;
    me: Coords | null;
    /** Approved murals; drawn only once zoomed in far enough to read them. */
    murals?: MapMural[];
    selectedMuralId?: string | null;
    onSelectMural?: (id: string) => void;
  }
>(function EmbedMap({ pins, initial, cooperative, selectedId, onSelect, onViewport, me, murals, selectedMuralId, onSelectMural }, ref) {
  const mapRef = useRef<MapRef | null>(null);
  const theme = useResolvedTheme();
  const themeRead = useThemeRead();
  const mapMode = useMapMode();
  const is3d = mapMode === "3d";
  const [view, setView] = useState<{ bounds: Bounds; zoom: number } | null>(null);

  useImperativeHandle(ref, () => ({
    flyTo: (c, zoom) => mapRef.current?.flyTo({ center: [c.lng, c.lat], zoom: zoom ?? 14, duration: 900, essential: true }),
    flyToPin: (pin) =>
      mapRef.current?.flyTo({
        center: [pin.lng, pin.lat],
        zoom: Math.max(mapRef.current.getZoom(), 15),
        duration: 800,
        essential: true,
      }),
    zoomBy: (d) => mapRef.current?.easeTo({ zoom: (mapRef.current.getZoom() ?? 12) + d, duration: 250 }),
  }));

  const report = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    if (!b) return;
    const zoom = map.getZoom();
    setView({ bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom });
    const c = map.getCenter();
    const center = { lat: c.lat, lng: c.lng };
    const radiusKm = distanceMeters(center, { lat: b.getNorth(), lng: b.getEast() }) / 1000;
    onViewport({ center, radiusKm: Math.min(Math.max(radiusKm, 0.5), 2000), zoom });
  }, [onViewport]);

  const index = useMemo(() => {
    const sc = new Supercluster<{ id: string }>({ radius: 56, maxZoom: 16 });
    sc.load(
      pins.map((p) => ({
        type: "Feature" as const,
        properties: { id: p.id },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      })),
    );
    return sc;
  }, [pins]);
  const byId = useMemo(() => new Map(pins.map((p) => [p.id, p])), [pins]);

  const clusters = useMemo(
    () => (view ? index.getClusters(view.bounds, Math.floor(view.zoom)) : []),
    [index, view],
  );

  // The selected pin always shows as itself, even while its neighbours cluster.
  const selectedInCluster = selectedId != null && !clusters.some((c) => !("cluster" in c.properties && c.properties.cluster) && c.properties.id === selectedId);
  const selectedPin = selectedId ? byId.get(selectedId) : undefined;

  useEffect(() => {
    // Style swaps (theme change) re-fire load; keep the view reported.
    report();
  }, [theme, report]);

  // 2D lies the map flat, 3D tilts it back to the city view.
  useEffect(() => {
    mapRef.current?.easeTo({ pitch: is3d ? 45 : 0, duration: 500 });
  }, [is3d]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="ar-grid absolute inset-0 flex items-center justify-center bg-ar-bg text-[12px] text-ar-faint">
        Map unavailable
      </div>
    );
  }

  if (!themeRead) return <div className="absolute inset-0" />;

  return (
    <div className="absolute inset-0">
      <MapGL
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: initial.center.lng, latitude: initial.center.lat, zoom: initial.zoom, pitch: is3d ? 45 : 0 }}
        mapStyle={mapStyleFor(mapMode, theme)}
        maxPitch={is3d ? 60 : 0}
        cooperativeGestures={cooperative}
        attributionControl={false}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        minZoom={2}
        maxZoom={19}
        onLoad={report}
        onMoveEnd={report}
        onClick={() => onSelect(null)}
        style={{ width: "100%", height: "100%" }}
      >
        {clusters.map((c) => {
          const [lng, lat] = c.geometry.coordinates as [number, number];
          const props = c.properties as { cluster?: boolean; point_count?: number; cluster_id?: number; id?: string };
          if (props.cluster && props.cluster_id != null) {
            const count = props.point_count ?? 0;
            const size = count < 10 ? 36 : count < 50 ? 44 : 52;
            return (
              <Marker key={`c-${props.cluster_id}`} longitude={lng} latitude={lat} anchor="center" style={{ zIndex: 5 }}>
                <button
                  aria-label={`${count} drops here — zoom in`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const z = Math.min(index.getClusterExpansionZoom(props.cluster_id!), 18);
                    mapRef.current?.easeTo({ center: [lng, lat], zoom: z, duration: 500 });
                  }}
                  className="font-hud flex items-center justify-center rounded-full border-2 border-ar-green bg-ar-green/25 text-[13px] font-bold text-ar-text backdrop-blur-xs transition-transform hover:scale-110"
                  style={{ width: size, height: size, boxShadow: "0 0 0 4px hsl(var(--ar-green) / 0.18)" }}
                >
                  {count}
                </button>
              </Marker>
            );
          }
          const pin = props.id ? byId.get(props.id) : undefined;
          if (!pin) return null;
          return <PinAt key={pin.id} pin={pin} selected={pin.id === selectedId} onSelect={onSelect} />;
        })}

        {selectedInCluster && selectedPin && <PinAt pin={selectedPin} selected onSelect={onSelect} />}

        {(view?.zoom ?? initial.zoom) >= MURAL_MIN_ZOOM &&
          murals?.map((m) => (
            <Marker key={`mural-${m.id}`} longitude={m.longitude} latitude={m.latitude} anchor="bottom" style={{ zIndex: m.id === selectedMuralId ? 20 : 9 }}>
              <MuralMarker mural={m} dailyLimit={Infinity} selected={m.id === selectedMuralId} onSelect={() => onSelectMural?.(m.id)} />
            </Marker>
          ))}

        {me && (
          <Marker longitude={me.lng} latitude={me.lat} anchor="center" style={{ zIndex: 30, pointerEvents: "none" }}>
            <span className="relative flex h-5 w-5 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/50" />
              <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-sky-500 shadow-sm" />
            </span>
          </Marker>
        )}
      </MapGL>
    </div>
  );
});

function PinAt({ pin, selected, onSelect }: { pin: ArPin; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <Marker longitude={pin.lng} latitude={pin.lat} anchor="bottom" style={{ zIndex: selected ? 20 : 10 }}>
      <PinMarker pin={pin} selected={selected} inRange={false} onSelect={() => onSelect(pin.id)} />
    </Marker>
  );
}
