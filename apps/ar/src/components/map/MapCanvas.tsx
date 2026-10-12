import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, { Marker, type MapRef, type ViewStateChangeEvent } from "react-map-gl/mapbox";
import Supercluster, { type ClusterProperties } from "supercluster";

import { AR_CAPTURE_RADIUS, distanceMeters } from "~/lib/ar/geo";
import type { ArPin, Coords, GeoFix } from "~/lib/ar/types";
import {
  mapStyleFor,
  type ResolvedTheme,
  useMapMode,
  useResolvedTheme,
  useThemeRead,
} from "~/lib/ar/theme";
import { cn } from "@wadzzo/ui/lib/cn";
import { ClusterBillboard } from "./ClusterBillboard";
import { MuralMarker, type MapMural } from "./MuralMarker";
import { PinMarker } from "./PinMarker";
import { metersPerPixel, UserPuck } from "./UserPuck";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API;

// Same grouping as the mobile app's map: zoomed out, pins that would overlap
// become a ClusterBillboard; from CLUSTER_MAX_ZOOM in, every pin is itself.
const CLUSTER_RADIUS = 70;
const CLUSTER_MAX_ZOOM = 13;
/** Safety cap on single markers on screen (nearest to the centre first). */
const MAX_MARKERS = 80;
const MAX_MURAL_MARKERS = 40;

const EMPTY_MURALS: MapMural[] = [];

type View = {
  bbox: [number, number, number, number];
  zoom: number;
  center: Coords;
};
type Group = {
  id: number;
  lng: number;
  lat: number;
  count: number;
  imgs: string[];
};

function useClusters<T>(
  items: T[],
  pos: (t: T) => Coords,
  img: (t: T) => string | undefined,
  view: View | null,
  max: number,
  keep: (t: T) => boolean,
) {
  const index = useMemo(() => {
    const sc = new Supercluster<{ i: number; imgs: string[] }, { imgs: string[] }>({
      radius: CLUSTER_RADIUS,
      maxZoom: CLUSTER_MAX_ZOOM,
      minPoints: 2,
      map: (p) => ({ imgs: [...p.imgs] }),
      reduce: (acc, p) => {
        for (const u of p.imgs) if (acc.imgs.length < 4 && !acc.imgs.includes(u)) acc.imgs.push(u);
      },
    });
    sc.load(
      items.map((t, i) => {
        const { lat, lng } = pos(t);
        const u = img(t);
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [lng, lat] },
          properties: { i, imgs: u ? [u] : [] },
        };
      }),
    );
    return sc;
    // pos/img are pure accessors; the index only depends on the items.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const result = useMemo(() => {
    if (!view || items.length === 0)
      return {
        singles: items.filter(keep).slice(0, max),
        groups: [] as Group[],
      };
    const groups: Group[] = [];
    const singles: { t: T; d: number }[] = [];
    for (const f of index.getClusters(view.bbox, Math.floor(view.zoom))) {
      const [lng, lat] = f.geometry.coordinates as [number, number];
      if ("cluster" in f.properties && f.properties.cluster) {
        const cp = f.properties;
        groups.push({
          id: cp.cluster_id,
          lng,
          lat,
          count: cp.point_count,
          imgs: cp.imgs,
        });
      } else {
        const t = items[(f.properties as { i: number }).i];
        if (t) singles.push({ t, d: distanceMeters(view.center, { lat, lng }) });
      }
    }
    const shown = singles
      .sort((a, b) => a.d - b.d)
      .slice(0, max)
      .map((x) => x.t);
    // The selected one always has its own marker, even inside a group.
    for (const t of items) if (keep(t) && !shown.includes(t)) shown.push(t);
    return { singles: shown, groups };
  }, [index, items, view, max, keep]);

  return { ...result, index };
}

/**
 * ── MapCanvas ──────────────────────────────────────────────────────────────
 *
 * Mapbox with the app's chrome removed: the "Wadzzo 3D" Standard styles
 * (3D buildings, Wadzzo colour theme — see MAP_STYLE) per the live theme,
 * with a faint terrain grid and a vignette so the edges fall away toward the
 * device bezel. Zoomed out, pins and murals group into ClusterBillboards
 * exactly like the mobile app's map.
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
  /** The user touched the map while compass mode was on — the parent turns compass mode off. */
  onCompassGesture?: () => void;
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
    onCompassGesture,
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
  /** Where the camera settled last — what the clusters are computed for. */
  const [view, setView] = useState<View | null>(null);
  const theme = useResolvedTheme();
  const themeRead = useThemeRead();
  const mapMode = useMapMode();
  const is3d = mapMode === "3d";

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

  // 2D lies the map flat; 3D tilts it back to the city view. Only the tilt is
  // touched, so the bearing (and compass mode) carry over.
  useEffect(() => {
    if (!ready) return;
    mapRef.current?.easeTo({
      pitch: is3d ? 48 : 0,
      duration: 600,
      essential: true,
    });
  }, [is3d, ready]);

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
  // Latest follow target, read by the compass easing below without re-running it.
  const followTarget = useRef<[number, number] | null>(null);
  followTarget.current = following && fix ? [fix.lng, fix.lat] : null;

  useEffect(() => {
    if (headingUp == null || !ready) return;

    const previous = lastBearing.current;
    if (previous != null) {
      const delta = Math.abs(((headingUp - previous + 540) % 360) - 180);
      if (delta < 2) return;
    }
    lastBearing.current = headingUp;

    // Carry the centre too while following: a bearing-only easeTo would
    // cancel the follow/re-centre easing mid-flight (it read as a double jump).
    mapRef.current?.easeTo({
      bearing: headingUp,
      ...(followTarget.current ? { center: followTarget.current } : {}),
      duration: 260,
      essential: true,
    });
  }, [headingUp, ready]);

  const onMove = (e: ViewStateChangeEvent) => setZoom(e.viewState.zoom);
  const reportBounds = () => {
    const map = mapRef.current;
    const b = map?.getBounds();
    if (!map || !b) return;
    onBoundsChange?.({
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    });
    const c = map.getCenter();
    setView({
      bbox: [
        Math.max(b.getWest(), -180),
        Math.max(b.getSouth(), -85),
        Math.min(b.getEast(), 180),
        Math.min(b.getNorth(), 85),
      ],
      zoom: map.getZoom(),
      center: { lat: c.lat, lng: c.lng },
    });
  };

  // ── What to draw: groups when zoomed out, single markers when close ──
  const keepPin = useCallback((p: ArPin) => p.id === selectedId, [selectedId]);
  const keepMural = useCallback((m: MapMural) => m.id === selectedMuralId, [selectedMuralId]);
  const pinLayer = useClusters(
    pins,
    (p) => p,
    (p) => p.brandImageUrl || p.imageUrl,
    view,
    MAX_MARKERS,
    keepPin,
  );
  const muralLayer = useClusters(
    murals ?? EMPTY_MURALS,
    (m) => ({ lat: m.latitude, lng: m.longitude }),
    (m) => m.coverUrl,
    view,
    MAX_MURAL_MARKERS,
    keepMural,
  );
  const openGroup = useCallback(
    (
      index: Supercluster<{ i: number; imgs: string[] }, { imgs: string[] }>,
      g: Group | undefined,
    ) => {
      if (!g) return;
      mapRef.current?.easeTo({
        center: [g.lng, g.lat],
        zoom: Math.min(index.getClusterExpansionZoom(g.id) + 0.3, 19),
        duration: 650,
        essential: true,
      });
    },
    [],
  );

  if (!MAPBOX_TOKEN) {
    return <MapFallback pins={pins} onSelect={onSelect} selectedId={selectedId} />;
  }

  // Don't create the map until the real theme is known (see useThemeRead).
  if (!themeRead) return <div className="absolute inset-0" />;

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
          pitch: is3d ? 48 : 0,
          bearing: is3d ? -14 : 0,
        }}
        mapStyle={mapStyleFor(mapMode, theme)}
        attributionControl={false}
        onLoad={() => {
          setReady(true);
          reportBounds();
        }}
        onMove={onMove}
        onMoveEnd={reportBounds}
        onDragStart={onUserPan}
        // Any user drag / zoom / rotate while compass mode is on turns it off.
        // (`originalEvent` is only set for user input, not our own easeTo.)
        onMoveStart={(e) => {
          if ((e as { originalEvent?: unknown }).originalEvent && headingUp != null)
            onCompassGesture?.();
        }}
        onClick={() => onSelect(null)}
        // A pitched map with 3D extrusions is what makes a city read as a
        // place rather than a street diagram — worth the extra tiles.
        maxPitch={is3d ? 62 : 0}
        // The whole world, like the app: zoomed out, pins group into
        // billboards (and Standard turns into a globe).
        minZoom={1}
        maxZoom={19.5}
        reuseMaps
        style={{ width: "100%", height: "100%" }}
      >
        {muralLayer.groups.map((g) => (
          <Marker
            key={`mg-${g.id}`}
            longitude={g.lng}
            latitude={g.lat}
            anchor="bottom"
            style={{ zIndex: 8 }}
          >
            <ClusterBillboard
              id={g.id}
              count={g.count}
              images={g.imgs}
              tone="mural"
              onOpen={(id) =>
                openGroup(
                  muralLayer.index,
                  muralLayer.groups.find((x) => x.id === id),
                )
              }
            />
          </Marker>
        ))}

        {pinLayer.groups.map((g) => (
          <Marker
            key={`g-${g.id}`}
            longitude={g.lng}
            latitude={g.lat}
            anchor="bottom"
            style={{ zIndex: 9 }}
          >
            <ClusterBillboard
              id={g.id}
              count={g.count}
              images={g.imgs}
              onOpen={(id) =>
                openGroup(
                  pinLayer.index,
                  pinLayer.groups.find((x) => x.id === id),
                )
              }
            />
          </Marker>
        ))}

        {muralLayer.singles.map((m) => (
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

        {pinLayer.singles.map((pin) => (
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
              inRange={fix ? distanceMeters(fix, pin) <= AR_CAPTURE_RADIUS : false}
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
 * Finish over the tiles — the grid ties the map to the rest of the UI, and
 * the vignette lets the map fall off into the bezel instead of stopping at a
 * hard edge.
 *
 * No colour wash any more: the basemap itself is now Wadzzo-coloured
 * ("Wadzzo 3D" styles, see MAP_STYLE), and a green multiply/overlay on top of
 * it double-tinted the map and made the web look different from the app.
 */
function MapGrade({ theme }: { theme: ResolvedTheme }) {
  const dark = theme === "dark";

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className={cn("ar-grid absolute inset-0", dark ? "opacity-[0.18]" : "opacity-[0.1]")} />
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
    <div className="ar-grid bg-ar-bg absolute inset-0 overflow-hidden">
      <div className="border-ar-green/20 absolute top-1/2 left-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border" />
      <div className="border-ar-green/25 absolute top-1/2 left-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full border" />
      <div className="border-ar-green/30 absolute top-1/2 left-1/2 h-[160px] w-[160px] -translate-x-1/2 -translate-y-1/2 rounded-full border" />
      <div
        className="animate-spin-slow absolute top-1/2 left-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
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
          "ar-glass rounded-ar absolute inset-x-5 top-1/2 -translate-y-1/2 px-4 py-3 text-center",
        )}
      >
        <p className="font-hud text-ar-green text-[11px] font-semibold tracking-[0.18em] uppercase">
          Map preview
        </p>
        <p className="text-ar-dim mt-1 text-[12px] leading-relaxed">
          Set <code className="text-ar-text">NEXT_PUBLIC_MAPBOX_API</code> to load live tiles.
        </p>
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(115%_80%_at_50%_46%,transparent_35%,hsl(var(--ar-void)/0.92)_100%)]" />
    </div>
  );
}
