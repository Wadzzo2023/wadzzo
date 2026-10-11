"use client";

import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Bike,
  Bus,
  Car,
  Check,
  ChevronLeft,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Footprints,
  Gauge,
  LocateFixed,
  Map as MapIcon,
  Merge,
  Navigation,
  RotateCcw,
  ScanLine,
  Split,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react";
import { useQueryParams, useRouter } from "~/lib/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, {
  Layer,
  Marker,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl";

import { DirectionsLoading } from "~/components/directions/DirectionsLoading";
import { DragSheet } from "~/components/directions/DragSheet";
import {
  CompassButton,
  CompassDial,
  HudIconButton,
  HudStat,
  MapIconButton,
  RecenterButton,
  UserArrow,
} from "~/components/directions/NavOverlays";
import {
  useNavCamera,
  type Orientation,
} from "~/components/directions/useNavCamera";
import { AppShell } from "~/components/shell/AppShell";
import { LocationGate } from "~/components/shell/LocationGate";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { Skeleton } from "~/components/ui/Skeleton";
import { distanceMeters, formatDistance } from "~/lib/ar/geo";
import { formatDuration, formatNavDistance } from "~/lib/ar/navigation";
import { RARITY_META } from "~/lib/ar/rarity";
import { MAP_STYLE, useResolvedTheme } from "~/lib/ar/theme";
import type { TravelMode } from "~/lib/ar/types";
import {
  firstText,
  PROFILE_LABEL,
  useDirections,
  type Route,
  type RouteStep,
} from "~/lib/ar/useDirections";
import { useDeviceHeading } from "~/lib/ar/useDeviceHeading";
import { useGeolocation } from "~/lib/ar/useGeolocation";
import { useNavigation } from "~/lib/ar/useNavigation";
import { usePinsQuery } from "~/lib/ar/usePins";
import { cn } from "~/lib/utils";
import { api } from "~/utils/api";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API;

const MODES: { id: TravelMode; icon: LucideIcon; label: string }[] = [
  { id: "walk", icon: Footprints, label: "Walk" },
  { id: "cycle", icon: Bike, label: "Cycle" },
  { id: "transit", icon: Bus, label: "Fastest" },
  { id: "drive", icon: Car, label: "Drive" },
];
const TRAVEL_MODES: TravelMode[] = ["walk", "cycle", "transit", "drive"];
const isTravelMode = (v: unknown): v is TravelMode =>
  typeof v === "string" && (TRAVEL_MODES as string[]).includes(v);

/** Murals are scannable from this far (matches MuralSheet). */
const MURAL_SCAN_FROM_M = 100;
/**
 * Above this speed (m/s, ~9 km/h) the map turns with your direction of
 * travel; slower — standing, walking — with the compass, like Google Maps.
 * A phone's compass is useless inside a moving car.
 */
const COURSE_SPEED = 2.5;
/** In preview, the route start snaps to this grid (~100 m) — re-plans only after a real move. */
const ORIGIN_GRID = 0.001;

/** Navigation look: Google-style, or the compass HUD. Remembered per device. */
type NavStyle = "classic" | "compass";
const STYLE_KEY = "wadzzo.navStyle";
const readStyle = (): NavStyle => {
  try {
    return localStorage.getItem(STYLE_KEY) === "compass"
      ? "compass"
      : "classic";
  } catch {
    return "classic";
  }
};

// Route line palette (emissive, so it stays bright under the night light preset).
const ROUTE = "#3fd831";
const ROUTE_CASING = "#0b4614";
const NAV_GREEN = "#0f5c1c";
const width = (lo: number, mid: number, hi: number) =>
  [
    "interpolate",
    ["exponential", 1.5],
    ["zoom"],
    12,
    lo,
    15.5,
    mid,
    19,
    hi,
  ] as unknown as number;

function maneuverIcon(
  step: Pick<RouteStep, "type" | "modifier"> | null,
): LucideIcon {
  if (!step) return ArrowUp;
  if (step.type === "arrive") return Flag;
  if (step.type === "roundabout" || step.type === "rotary") return RotateCcw;
  if (step.type === "merge") return Merge;
  if (step.type === "fork") return Split;
  const m = step.modifier ?? "";
  if (m === "uturn") return RotateCcw;
  if (m === "slight left") return ArrowUpLeft;
  if (m === "slight right") return ArrowUpRight;
  if (m.includes("left")) return CornerUpLeft;
  if (m.includes("right")) return CornerUpRight;
  return ArrowUp;
}

const line = (coordinates: [number, number][]) => ({
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates },
});
const arrivalTime = (seconds: number) =>
  new Date(Date.now() + seconds * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

/** Chevron drawn along the route (added to the style on demand). */
function chevronImage() {
  const s = 48;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const x = c.getContext("2d")!;
  x.strokeStyle = "rgba(255,255,255,0.95)";
  x.lineWidth = 7;
  x.lineCap = "round";
  x.lineJoin = "round";
  x.beginPath();
  x.moveTo(17, 12);
  x.lineTo(31, 24);
  x.lineTo(17, 36);
  x.stroke();
  return x.getImageData(0, 0, s, s);
}

/**
 * ── /directions/[id] ───────────────────────────────────────────────────────
 *
 * Google-Maps-style directions to a drop (or `?kind=mural`):
 *
 *  Preview   route framed on the 3D map, every mode's real time, tappable
 *            alternatives, a draggable sheet (peek / half / full with steps),
 *            compass + my-location buttons.
 *  Navigate  a frame-smoothed camera (useNavCamera) that follows you heading-
 *            up or north-up and never fights your pinch-zoom; compass and
 *            re-centre buttons; two looks — "Classic" (turn banner + draggable
 *            sheet) and "Compass" (dark HUD with a compass dial and corner
 *            stats) — switchable any time; voice, haptics, rerouting, arrival.
 */
export default function DirectionsScreen() {
  const router = useRouter();
  const { query: urlQuery, ready: urlReady } = useQueryParams();
  const theme = useResolvedTheme();
  // Our style imports Mapbox Standard; the root style says "loaded" before that import is,
  // and adding a layer then throws "Style is not done loading" (mapbox validates the whole
  // style, imports included). So the route layers mount only once `style.load` has fired
  // for the current style URL.
  const styleUrl = MAP_STYLE[theme];
  const styleUrlRef = useRef(styleUrl);
  styleUrlRef.current = styleUrl;
  const [loadedStyle, setLoadedStyle] = useState<string | null>(null);
  const styleReady = loadedStyle === styleUrl;
  const mapRef = useRef<MapRef | null>(null);
  const arrowRef = useRef<HTMLDivElement | null>(null);
  const dialRef = useRef<HTMLDivElement | null>(null);
  const needleRef = useRef<HTMLSpanElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const id = typeof urlQuery.id === "string" ? urlQuery.id : null;
  const isMural = urlQuery.kind === "mural";

  const {
    fix,
    status: geoStatus,
    reason: geoReason,
    retry: retryLocation,
  } = useGeolocation();
  const { pins, isLoading: pinsLoading } = usePinsQuery();
  const [mode, setMode] = useState<TravelMode>("walk");

  const modeFromUrl = urlQuery.mode;
  const adoptedUrlMode = useRef(false);
  useEffect(() => {
    if (adoptedUrlMode.current || !urlReady) return;
    adoptedUrlMode.current = true;
    if (isTravelMode(modeFromUrl)) setMode(modeFromUrl);
  }, [urlReady, modeFromUrl]);

  const pin = useMemo(
    () => (isMural ? null : (pins.find((p) => p.id === id) ?? null)),
    [pins, id, isMural],
  );
  const muralQuery = api.murals.byId.useQuery(
    { id: id ?? "" },
    { enabled: isMural && Boolean(id) },
  );
  const mural = muralQuery.data?.mural;
  const target = useMemo(
    () =>
      isMural
        ? mural
          ? {
              lat: mural.latitude,
              lng: mural.longitude,
              title: mural.title,
              subtitle: mural.artist ? `by ${mural.artist}` : "Mural",
              imageUrl: mural.coverUrl,
            }
          : null
        : pin
          ? {
              lat: pin.lat,
              lng: pin.lng,
              title: pin.title,
              subtitle: pin.brandName,
              imageUrl: pin.imageUrl,
            }
          : null,
    [isMural, mural, pin],
  );

  // ── Route ──
  const [phase, setPhase] = useState<"preview" | "nav">("preview");
  const navigating = phase === "nav";
  const previewOrigin = useMemo(
    () =>
      fix
        ? {
            lat: Math.round(fix.lat / ORIGIN_GRID) * ORIGIN_GRID,
            lng: Math.round(fix.lng / ORIGIN_GRID) * ORIGIN_GRID,
          }
        : null,
    [fix],
  );
  const [navOrigin, setNavOrigin] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const {
    routes,
    route,
    select,
    modeTimes,
    isLoading: routeLoading,
    error: routeError,
  } = useDirections({
    from: navigating ? navOrigin : previewOrigin,
    to: target ? { lat: target.lat, lng: target.lng } : null,
    mode,
    token: MAPBOX_TOKEN,
  });

  // ── Voice / haptics ──
  const [muted, setMuted] = useState(false);
  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en";
    window.speechSynthesis.speak(u);
  }, []);
  const buzz = useCallback(() => navigator.vibrate?.(40), []);
  const onReroute = useCallback(
    (from: { lat: number; lng: number }) => {
      setNavOrigin(from);
      if (!muted) speak("Rerouting.");
    },
    [muted, speak],
  );
  const rerouting = navigating && routeLoading;
  const nav = useNavigation({
    route,
    fix,
    active: navigating,
    muted,
    speak,
    buzz,
    onReroute,
  });

  // ── Compass ──
  const compass = useDeviceHeading();
  const { request: requestCompass } = compass;
  useEffect(() => {
    void requestCompass();
  }, [requestCompass]);
  const compassHeading = compass.source === "sensor" ? compass.heading : null;
  const moving = (fix?.speed ?? 0) > COURSE_SPEED;
  const facing = nav
    ? moving || compassHeading == null
      ? nav.snap.heading
      : compassHeading
    : (compassHeading ?? 0);

  // Keep the screen on while navigating.
  useEffect(() => {
    if (!navigating || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    void navigator.wakeLock
      .request("screen")
      .then((l) => (lock = l))
      .catch(() => undefined);
    return () => void lock?.release();
  }, [navigating]);

  // ── Look + camera ──
  const [navStyle, setNavStyleState] = useState<NavStyle>("classic");
  useEffect(() => setNavStyleState(readStyle()), []);
  const setNavStyle = (s: NavStyle) => {
    setNavStyleState(s);
    try {
      localStorage.setItem(STYLE_KEY, s);
    } catch {
      // Private mode: just this session.
    }
  };
  const hud = navigating && navStyle === "compass";
  const [following, setFollowing] = useState(true);
  const [orientation, setOrientation] = useState<Orientation>("heading");
  const [menu, setMenu] = useState<null | "style" | "steps">(null);
  const [sheetIndex, setSheetIndex] = useState(0);

  const at = useMemo<[number, number] | null>(
    () =>
      fix
        ? nav && nav.snap.off < 25
          ? nav.snap.point
          : [fix.lng, fix.lat]
        : null,
    [fix, nav],
  );
  useNavCamera({
    mapRef,
    active: navigating,
    following,
    orientation,
    target: at ? { pos: at, heading: facing } : null,
    arrowRef,
    dialRef,
    needleRef,
  });

  // Sheet sizes follow the screen.
  const [boxH, setBoxH] = useState(800);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fix, target]);
  const previewSnaps = [0, Math.round(boxH * 0.5), Math.round(boxH * 0.86)]; // 0 = fit the header
  const navSnaps = [0, Math.min(Math.round(boxH * 0.62), 520)]; // 0 = fit the header
  const NAV_PEEK = 100;
  const PREVIEW_PEEK = 236;

  const padding = useCallback(
    () =>
      navStyle === "compass"
        ? { top: 0, bottom: 0, left: 0, right: 0 }
        : { top: 230, bottom: NAV_PEEK + 40, left: 0, right: 0 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navStyle],
  );
  /** Fly to "you", in the current look; the frame loop takes over after. `o` = the orientation being switched to (state is still the old one). */
  const flyToMe = useCallback(
    (o: Orientation = orientation) => {
      const map = mapRef.current;
      if (!map || !at) return;
      map.easeTo({
        center: at,
        bearing: o === "heading" ? facing : map.getBearing(),
        pitch: navStyle === "compass" ? 0 : 60,
        zoom: navStyle === "compass" ? 17.2 : 17.6,
        padding: padding(),
        duration: 900,
        essential: true,
      });
      setFollowing(true);
    },
    [at, facing, orientation, navStyle, padding],
  );

  const fitRoute = useCallback(
    (r: Route | null) => {
      const map = mapRef.current;
      if (!map || !r || !fix) return;
      let w = fix.lng,
        e = fix.lng,
        s = fix.lat,
        n = fix.lat;
      for (const [lng, lat] of r.coordinates) {
        w = Math.min(w, lng);
        e = Math.max(e, lng);
        s = Math.min(s, lat);
        n = Math.max(n, lat);
      }
      map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        {
          padding: { top: 96, bottom: PREVIEW_PEEK + 40, left: 48, right: 48 },
          pitch: 45,
          bearing: 0,
          duration: 900,
          maxZoom: 17.5,
        },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fix, boxH],
  );
  useEffect(() => {
    if (!navigating) fitRoute(route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.id, navigating]);

  // Switching look mid-route re-frames for it.
  const lastStyle = useRef(navStyle);
  useEffect(() => {
    if (navigating && lastStyle.current !== navStyle) flyToMe();
    lastStyle.current = navStyle;
  }, [navStyle, navigating, flyToMe]);

  const start = () => {
    if (compass.permission !== "granted") void requestCompass();
    setNavOrigin(previewOrigin);
    setOrientation("heading");
    setSheetIndex(0);
    setMenu(null);
    setPhase("nav");
    flyToMe("heading");
    if (!muted && target) speak(`Starting route to ${target.title}.`);
  };
  const stop = () => {
    window.speechSynthesis?.cancel();
    setPhase("preview");
    setMenu(null);
    setFollowing(true);
    mapRef.current
      ?.getMap()
      .setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    fitRoute(route);
  };

  /** Re-centre = back to you with the compass on (same as tapping the compass while it's off). */
  const recenter = () => {
    setOrientation("heading");
    flyToMe("heading");
  };
  const onCompass = () => {
    const map = mapRef.current;
    if (!map) return;
    if (navigating) {
      // Heading-up ↔ north-up, like Google's compass button.
      const next: Orientation = orientation === "heading" ? "north" : "heading";
      setOrientation(next);
      // Turning the compass on: re-centre on you first (fly in, facing your way), then it turns with you.
      if (next === "heading") flyToMe("heading");
      else map.easeTo({ bearing: 0, duration: 450 });
    } else {
      map.easeTo({ bearing: 0, pitch: 0, duration: 500 });
    }
  };
  const onMove = (e: ViewStateChangeEvent) => {
    // Preview: the frame loop isn't running, so turn the needle here.
    if (!navigating && needleRef.current)
      needleRef.current.style.transform = `rotate(${-e.viewState.bearing}deg)`;
  };

  // Alternatives: click the grey line or its time bubble.
  const alts = routes.filter((r) => r.id !== route?.id);
  const onMapClick = (e: MapLayerMouseEvent) => {
    const hit = e.features?.find(
      (f) => f.layer?.id === "alt-line" || f.layer?.id === "alt-casing",
    );
    const rid = hit?.properties?.rid as string | undefined;
    if (rid && !navigating) select(rid);
  };

  if (!fix) {
    return (
      <AppShell tabs={false}>
        <div className="relative h-full">
          <LocationGate
            status={geoStatus}
            reason={geoReason}
            onRetry={retryLocation}
          />
        </div>
      </AppShell>
    );
  }

  if (
    !target &&
    (isMural ? muralQuery.isLoading : pinsLoading || !urlReady)
  ) {
    return (
      <AppShell tabs={false}>
        <DirectionsLoading mural={isMural} onBack={() => router.back()} />
      </AppShell>
    );
  }

  if (!target) {
    return (
      <AppShell>
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="font-hud text-[15px] font-bold uppercase tracking-[0.12em] text-ar-dim">
            {isMural ? "Mural not found" : "Pin not found"}
          </p>
          <ArLinkButton href="/map" variant="primary" size="md">
            Back to the map
          </ArLinkButton>
        </div>
      </AppShell>
    );
  }

  const meta = RARITY_META[isMural ? "epic" : pin!.rarity];
  const progress = nav?.progress;
  const NextIcon = maneuverIcon(progress?.next ?? null);
  const ThenIcon = maneuverIcon(progress?.then ?? null);
  const fastest = routes[0];
  const handoff = isMural
    ? { href: `/murals?target=${id}`, label: "Scan this mural", icon: ScanLine }
    : {
        href: `/ar?target=${id}`,
        label: "Open AR to collect",
        icon: Navigation,
      };
  const turnText = progress
    ? firstText(
        route?.steps[progress.step]?.banner,
        progress.next?.instruction,
        target.title,
      )
    : "";
  const street = progress
    ? firstText(route?.steps[progress.step]?.name, route?.summary)
    : "";
  const remainingSteps =
    route && progress
      ? route.steps.slice(progress.step + 1)
      : (route?.steps ?? []);
  const routeEnd = route?.coordinates[route.coordinates.length - 1];
  // Dotted "last metres" from the road to the drop, and (preview) from you to the road.
  const connectors: [number, number][][] = [];
  if (
    routeEnd &&
    distanceMeters({ lng: routeEnd[0], lat: routeEnd[1] }, target) > 6
  )
    connectors.push([routeEnd, [target.lng, target.lat]]);
  const routeStart = route?.coordinates[0];
  if (
    !navigating &&
    routeStart &&
    distanceMeters({ lng: routeStart[0], lat: routeStart[1] }, fix) > 6
  )
    connectors.push([[fix.lng, fix.lat], routeStart]);
  const kmh =
    fix.speed != null && fix.speed >= 0 ? Math.round(fix.speed * 3.6) : null;
  const leftMin = progress
    ? Math.max(1, Math.round(progress.remainingTime / 60))
    : 0;

  const stepsList = (steps: RouteStep[]) => (
    <ol className="divide-y divide-ar-line rounded-ar border border-ar-line">
      {steps.map((step, i) => {
        const Icon = maneuverIcon(step);
        return (
          <li key={i} className="flex items-center gap-3 px-3.5 py-3">
            <Icon
              size={18}
              strokeWidth={2.3}
              className="shrink-0 text-ar-dim"
            />
            <span className="min-w-0 flex-1 text-[13px] text-ar-text">
              {step.instruction}
            </span>
            {step.distance > 0 && (
              <span className="font-hud shrink-0 text-[11px] font-bold tabular-nums text-ar-faint">
                {formatNavDistance(step.distance)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );

  return (
    <AppShell tabs={false}>
      <div ref={boxRef} className="relative h-full select-none overflow-hidden">
        {/* ── Map ─────────────────────────────────────────────────────── */}
        {MAPBOX_TOKEN ? (
          <MapGL
            ref={mapRef}
            mapboxAccessToken={MAPBOX_TOKEN}
            initialViewState={{
              longitude: fix.lng,
              latitude: fix.lat,
              zoom: 15,
              pitch: 45,
            }}
            mapStyle={styleUrl}
            // Theme switch = rebuild, not diff: a diff reloads the import in place under our layers.
            styleDiffing={false}
            attributionControl={false}
            interactiveLayerIds={navigating ? [] : ["alt-casing", "alt-line"]}
            onClick={onMapClick}
            onMove={onMove}
            // Any touch (pan, pinch, scroll, rotate) takes the wheel: the compass turns off and the
            // camera stops following. Re-centre or the compass button brings both back.
            onMoveStart={(e) => {
              if (!navigating || !e.originalEvent) return;
              setOrientation("north");
              setFollowing(false);
            }}
            onLoad={(e) => {
              const map = e.target;
              map.on("styleimagemissing", (ev: { id: string }) => {
                if (ev.id === "route-chevron" && !map.hasImage("route-chevron"))
                  map.addImage("route-chevron", chevronImage(), {
                    pixelRatio: 2,
                  });
              });
              map.on("style.load", () => setLoadedStyle(styleUrlRef.current));
              if (map.isStyleLoaded()) setLoadedStyle(styleUrlRef.current);
              fitRoute(route);
            }}
            cursor="auto"
            maxPitch={70}
            style={{ width: "100%", height: "100%" }}
          >
            {/* Alternatives, walked, connectors, route — mounted together, in this order, once the style is ready. */}
            {styleReady && (
              <>
                <Source
                  id="alts"
                  type="geojson"
                  data={{
                    type: "FeatureCollection",
                    features: navigating
                      ? []
                      : alts.map((r) => ({
                          ...line(r.coordinates),
                          properties: { rid: r.id },
                        })),
                  }}
                >
                  <Layer
                    id="alt-casing"
                    type="line"
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{
                      "line-color": theme === "dark" ? "#0b1410" : "#7d9688",
                      "line-width": width(4, 9, 18),
                      "line-emissive-strength": 1,
                    }}
                  />
                  <Layer
                    id="alt-line"
                    type="line"
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{
                      "line-color": theme === "dark" ? "#55705f" : "#c3d3c9",
                      "line-width": width(2.5, 6, 13),
                      "line-emissive-strength": 1,
                    }}
                  />
                </Source>
                <Source
                  id="done"
                  type="geojson"
                  data={line(navigating && nav ? nav.done : [])}
                >
                  <Layer
                    id="done-line"
                    type="line"
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{
                      "line-color": theme === "dark" ? "#5d6e65" : "#9fb0a6",
                      "line-width": width(3, 6.5, 14),
                      "line-opacity": 0.8,
                      "line-emissive-strength": 1,
                    }}
                  />
                </Source>
                <Source
                  id="connect"
                  type="geojson"
                  data={{
                    type: "FeatureCollection",
                    features: connectors.map(line),
                  }}
                >
                  <Layer
                    id="connect-dots"
                    type="line"
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{
                      "line-color": ROUTE,
                      "line-width": width(2.5, 4.5, 8),
                      "line-dasharray": [0, 2],
                      "line-emissive-strength": 1,
                    }}
                  />
                </Source>
                <Source
                  id="route"
                  type="geojson"
                  data={line(
                    !route
                      ? []
                      : navigating && nav
                        ? nav.ahead
                        : route.coordinates,
                  )}
                >
                  <Layer
                    id="route-glow"
                    type="line"
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{
                      "line-color": ROUTE,
                      "line-width": width(8, 18, 34),
                      "line-opacity": 0.22,
                      "line-blur": 6,
                      "line-emissive-strength": 1,
                    }}
                  />
                  <Layer
                    id="route-casing"
                    type="line"
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{
                      "line-color": ROUTE_CASING,
                      "line-width": width(5, 11, 22),
                      "line-emissive-strength": 1,
                    }}
                  />
                  <Layer
                    id="route-line"
                    type="line"
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{
                      "line-color": ROUTE,
                      "line-width": width(3, 7, 15),
                      "line-emissive-strength": 1,
                    }}
                  />
                  <Layer
                    id="route-chevrons"
                    type="symbol"
                    minzoom={14.5}
                    layout={{
                      "symbol-placement": "line",
                      "symbol-spacing": 64,
                      "icon-image": "route-chevron",
                      "icon-size": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        14.5,
                        0.35,
                        17,
                        0.6,
                        19,
                        1,
                      ] as unknown as number,
                      "icon-allow-overlap": true,
                      "icon-ignore-placement": true,
                      "icon-rotation-alignment": "map",
                      "icon-pitch-alignment": "map",
                    }}
                    paint={{
                      "icon-opacity": 0.85,
                      "icon-emissive-strength": 1,
                    }}
                  />
                </Source>
              </>
            )}

            {/* Time bubbles (preview). */}
            {!navigating &&
              alts.map((r) => {
                const mid = r.coordinates[Math.floor(r.coordinates.length / 2)];
                if (!mid || !fastest) return null;
                const diff = Math.round(
                  (r.duration - (route?.duration ?? r.duration)) / 60,
                );
                return (
                  <Marker
                    key={r.id}
                    longitude={mid[0]}
                    latitude={mid[1]}
                    anchor="bottom"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        select(r.id);
                      }}
                      className="font-hud rounded-[10px] border border-ar-line bg-ar-surface px-2 py-1 text-[11px] font-bold text-ar-dim shadow-lg"
                    >
                      {formatDuration(r.duration)}
                      {diff !== 0 && (
                        <span className="ml-1 font-medium text-ar-faint">
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      )}
                    </button>
                  </Marker>
                );
              })}
            {!navigating &&
              route &&
              route.coordinates.length > 2 &&
              (() => {
                const mid =
                  route.coordinates[
                    Math.floor(route.coordinates.length * 0.45)
                  ]!;
                return (
                  <Marker longitude={mid[0]} latitude={mid[1]} anchor="bottom">
                    <span className="font-hud block rounded-[10px] border border-[#0b4614] bg-[#3fd831] px-2 py-1 text-[11.5px] font-bold text-[#04250a] shadow-lg">
                      {formatDuration(route.duration)}
                    </span>
                  </Marker>
                );
              })()}

            {/* Next manoeuvre (classic navigation). */}
            {navigating && !hud && progress?.next && (
              <Marker
                longitude={progress.next.location[0]}
                latitude={progress.next.location[1]}
                anchor="center"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-white bg-[#0f5c1c] text-white shadow-lg">
                  <NextIcon size={15} strokeWidth={3} />
                </span>
              </Marker>
            )}

            {/* Destination. */}
            <Marker
              longitude={target.lng}
              latitude={target.lat}
              anchor="bottom"
            >
              <span className="flex flex-col items-center">
                <span
                  className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-[14px] border-[3px] bg-ar-surface"
                  style={{
                    borderColor: `hsl(${meta.hsl})`,
                    boxShadow: `0 0 22px hsl(${meta.hsl} / 0.7)`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={target.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </span>
                <span
                  className="h-3 w-[3px] rounded-full"
                  style={{ background: `hsl(${meta.hsl})` }}
                />
              </span>
            </Marker>

            {/* You (preview): dot + compass beam. Navigating uses the overlay arrow. */}
            {!navigating && (
              <Marker
                longitude={fix.lng}
                latitude={fix.lat}
                anchor="center"
                rotationAlignment="map"
                rotation={compassHeading ?? 0}
              >
                <span className="relative flex h-[54px] w-[54px] items-center justify-center">
                  {compassHeading != null && (
                    <svg
                      width="54"
                      height="54"
                      viewBox="0 0 54 54"
                      className="absolute inset-0"
                      aria-hidden
                    >
                      <defs>
                        <radialGradient id="beam" cx="50%" cy="100%" r="100%">
                          <stop
                            offset="0"
                            stopColor="#3fd831"
                            stopOpacity="0.55"
                          />
                          <stop
                            offset="1"
                            stopColor="#3fd831"
                            stopOpacity="0"
                          />
                        </radialGradient>
                      </defs>
                      <path
                        d="M27 27 L13 2 A28 28 0 0 1 41 2 Z"
                        fill="url(#beam)"
                      />
                    </svg>
                  )}
                  <span className="relative block h-[18px] w-[18px] rounded-full border-[3px] border-white bg-[#3fd831] shadow-[0_0_0_6px_rgba(63,216,49,0.25)]" />
                </span>
              </Marker>
            )}
          </MapGL>
        ) : (
          <div className="ar-grid flex h-full items-center justify-center bg-ar-surface">
            <p className="font-hud text-[11px] uppercase tracking-[0.18em] text-ar-faint">
              Map preview
            </p>
          </div>
        )}

        {/* HUD: darken the map so the dial and stats read. */}
        {hud && (
          <div className="pointer-events-none absolute inset-0 z-[3] bg-[radial-gradient(circle_at_50%_50%,rgba(4,8,6,0.12)_0%,rgba(4,8,6,0.5)_55%,rgba(4,8,6,0.85)_100%)]" />
        )}
        {navigating && hud && (
          <CompassDial
            ref={dialRef}
            size={Math.min(300, Math.round(boxH * 0.38))}
          />
        )}
        {navigating && <UserArrow ref={arrowRef} hud={hud} />}

        {/* ── Classic: turn banner ───────────────────────────────────── */}
        {navigating && !hud && progress && !nav?.arrived && (
          <div
            className="absolute inset-x-3 z-10"
            style={{ top: "calc(var(--ar-top-inset) + 10px)" }}
          >
            <div
              className="rounded-[20px] px-4 py-3.5 text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)]"
              style={{ background: NAV_GREEN }}
            >
              <div className="flex items-center gap-3.5">
                <NextIcon size={40} strokeWidth={2.6} className="shrink-0" />
                <div className="min-w-0">
                  <p className="font-hud text-[26px] font-bold tabular-nums leading-none">
                    {formatNavDistance(progress.toNext)}
                  </p>
                  <p className="mt-1 truncate text-[15px] font-semibold leading-snug text-white/95">
                    {turnText}
                  </p>
                </div>
              </div>
            </div>
            {progress.then && progress.nextToThen < 150 && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-b-[14px] rounded-t-[6px] bg-[#0a4214] px-3 py-1.5 text-[12.5px] font-semibold text-white/90">
                Then <ThenIcon size={16} strokeWidth={2.6} />
              </div>
            )}
          </div>
        )}

        {/* ── Compass HUD ─────────────────────────────────────────────── */}
        {navigating && hud && progress && !nav?.arrived && (
          <>
            <div
              className="pointer-events-none absolute inset-x-5 z-10 flex justify-between"
              style={{ top: "calc(var(--ar-top-inset) + 14px)" }}
            >
              <HudStat value={kmh ?? "—"} unit="km/h" label="Speed" />
              <HudStat
                value={
                  leftMin < 60
                    ? leftMin
                    : `${Math.floor(leftMin / 60)}:${String(leftMin % 60).padStart(2, "0")}`
                }
                unit={leftMin < 60 ? "min" : "h"}
                label="Time left"
                align="right"
              />
            </div>
            <div
              className="absolute inset-x-3 z-10 flex justify-between"
              style={{ top: "calc(var(--ar-top-inset) + 92px)" }}
            >
              <HudIconButton
                icon="menu"
                label="Route and options"
                onClick={() => setMenu("steps")}
              />
              <HudIconButton
                icon="style"
                label="Navigation style"
                onClick={() => setMenu("style")}
              />
            </div>
            {/* Turn pill above you, street below — you sit at the centre in this look. */}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2"
              style={{ marginTop: -78 }}
            >
              <span className="flex items-center gap-2 whitespace-nowrap rounded-full bg-black/80 px-4 py-2 text-white shadow-lg ring-1 ring-white/10">
                <NextIcon size={18} strokeWidth={2.8} />
                <span className="font-hud text-[16px] font-bold tabular-nums">
                  {formatNavDistance(progress.toNext)}
                </span>
              </span>
            </div>
            <p
              className="pointer-events-none absolute left-1/2 top-1/2 z-10 max-w-[70%] -translate-x-1/2 truncate text-center text-[15px] font-medium text-white/90"
              style={{ marginTop: 40 }}
            >
              {street || turnText}
            </p>
            <div
              className="pointer-events-none absolute inset-x-5 z-10 flex justify-between"
              style={{ bottom: "calc(env(safe-area-inset-bottom) + 96px)" }}
            >
              <HudStat
                value={
                  progress.remaining >= 1000
                    ? (progress.remaining / 1000).toFixed(1)
                    : Math.round(progress.remaining / 10) * 10
                }
                unit={progress.remaining >= 1000 ? "km" : "m"}
                label="Distance"
              />
              <HudStat
                value={arrivalTime(progress.remainingTime)}
                label="Arrive"
                align="right"
              />
            </div>
            <div
              className="absolute inset-x-0 z-10 flex items-center justify-center gap-3"
              style={{ bottom: "calc(env(safe-area-inset-bottom) + 22px)" }}
            >
              <button
                onClick={stop}
                aria-label="End navigation"
                className="flex h-12 items-center gap-2 rounded-full bg-[#ef4444] px-5 text-white shadow-lg"
              >
                <X size={18} strokeWidth={2.8} />
                <span className="font-hud text-[12px] font-bold uppercase tracking-[0.14em]">
                  End
                </span>
              </button>
              <button
                onClick={() => {
                  setMuted((m) => !m);
                  window.speechSynthesis?.cancel();
                }}
                aria-label={muted ? "Unmute voice" : "Mute voice"}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white"
              >
                {muted ? (
                  <VolumeX size={20} strokeWidth={2.4} />
                ) : (
                  <Volume2 size={20} strokeWidth={2.4} />
                )}
              </button>
            </div>
          </>
        )}

        {navigating && rerouting && (
          <div
            className="absolute inset-x-0 z-10 flex justify-center"
            style={{ top: "calc(var(--ar-top-inset) + 132px)" }}
          >
            <span className="font-hud rounded-full bg-ar-surface px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ar-green-hot shadow-lg">
              Rerouting…
            </span>
          </div>
        )}

        {/* ── Map buttons: compass + locate (right side) ──────────────── */}
        {!nav?.arrived && (
          <div
            className="absolute right-3 z-10 flex flex-col gap-2.5"
            style={{
              top: navigating
                ? hud
                  ? "calc(var(--ar-top-inset) + 150px)"
                  : "calc(var(--ar-top-inset) + 128px)"
                : "calc(var(--ar-top-inset) + 12px)",
            }}
          >
            <CompassButton
              ref={needleRef}
              onClick={onCompass}
              northUp={navigating && orientation === "north"}
            />
            {!navigating && (
              <MapIconButton
                icon={LocateFixed}
                label="Show my location"
                onClick={() =>
                  mapRef.current?.easeTo({
                    center: [fix.lng, fix.lat],
                    zoom: 16.5,
                    duration: 700,
                  })
                }
              />
            )}
          </div>
        )}

        {/* Re-centre after a pan. */}
        {navigating && !following && !nav?.arrived && (
          <div
            className="absolute inset-x-0 z-20 flex justify-center"
            style={{
              bottom: hud
                ? "calc(env(safe-area-inset-bottom) + 170px)"
                : NAV_PEEK + 16,
            }}
          >
            <RecenterButton onClick={recenter} />
          </div>
        )}

        {/* Preview: back. */}
        {!navigating && (
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="ar-glass absolute left-4 z-10 flex h-10 items-center gap-1 rounded-full pl-2 pr-3.5 text-ar-text"
            style={{ top: "calc(var(--ar-top-inset) + 12px)" }}
          >
            <ChevronLeft size={18} strokeWidth={2.4} />
            <span className="font-hud text-[10.5px] font-semibold uppercase tracking-[0.14em]">
              Back
            </span>
          </button>
        )}

        {/* ── Classic navigation: draggable sheet ─────────────────────── */}
        {navigating && !hud && progress && !nav?.arrived && (
          <DragSheet
            snaps={navSnaps}
            index={sheetIndex}
            onIndexChange={setSheetIndex}
            header={
              <div className="flex items-center gap-3 pb-3">
                <button
                  onClick={stop}
                  aria-label="End navigation"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ar-danger/15 text-ar-danger"
                >
                  <X size={22} strokeWidth={2.6} />
                </button>
                <div className="min-w-0 flex-1 text-center">
                  <p className="font-hud text-[24px] font-bold leading-none text-ar-green-hot">
                    {formatDuration(progress.remainingTime)}
                  </p>
                  <p className="mt-1 text-[12.5px] text-ar-dim">
                    {formatNavDistance(progress.remaining)} ·{" "}
                    {arrivalTime(progress.remainingTime)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setMuted((m) => !m);
                    window.speechSynthesis?.cancel();
                  }}
                  aria-label={muted ? "Unmute voice" : "Mute voice"}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-ar-text"
                >
                  {muted ? (
                    <VolumeX size={20} strokeWidth={2.4} />
                  ) : (
                    <Volume2 size={20} strokeWidth={2.4} />
                  )}
                </button>
              </div>
            }
          >
            <StylePicker value={navStyle} onChange={setNavStyle} />
            <p className="font-hud mb-2 mt-4 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ar-faint">
              Next turns
            </p>
            {stepsList(remainingSteps)}
          </DragSheet>
        )}

        {/* HUD menus. */}
        {hud && menu && (
          <div
            className="absolute inset-0 z-30 flex items-end bg-black/50"
            onClick={() => setMenu(null)}
          >
            <div
              className="max-h-[75%] w-full overflow-y-auto rounded-t-[24px] border-t border-ar-line bg-ar-bg px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4"
              onClick={(e) => e.stopPropagation()}
            >
              {menu === "style" ? (
                <>
                  <p className="font-hud mb-3 text-[12px] font-bold uppercase tracking-[0.18em] text-ar-dim">
                    Navigation style
                  </p>
                  <StylePicker
                    value={navStyle}
                    onChange={(s) => {
                      setNavStyle(s);
                      setMenu(null);
                    }}
                  />
                </>
              ) : (
                <>
                  <p className="font-hud mb-1 text-[16px] font-bold text-ar-text">
                    {target.title}
                  </p>
                  <p className="mb-3 text-[12.5px] text-ar-dim">
                    {progress
                      ? `${formatDuration(progress.remainingTime)} · ${formatNavDistance(progress.remaining)}`
                      : ""}
                  </p>
                  {stepsList(remainingSteps)}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Arrived ─────────────────────────────────────────────────── */}
        {navigating && nav?.arrived && (
          <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-[24px] border-t border-ar-line bg-ar-bg px-5 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-5">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ar-green/20 text-ar-green-hot">
                <Check size={26} strokeWidth={3} />
              </span>
              <div className="min-w-0">
                <p className="font-hud text-[19px] font-bold text-ar-text">
                  You&apos;ve arrived
                </p>
                <p className="truncate text-[13px] text-ar-dim">
                  {target.title}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <ArLinkButton
                href={handoff.href}
                variant="primary"
                size="lg"
                block
                icon={handoff.icon}
              >
                {handoff.label}
              </ArLinkButton>
              <ArButton
                variant="ghost"
                size="md"
                block
                onClick={() => void router.push("/map")}
              >
                Done
              </ArButton>
            </div>
          </div>
        )}

        {/* ── Preview: draggable sheet ────────────────────────────────── */}
        {!navigating && (
          <DragSheet
            snaps={previewSnaps}
            index={sheetIndex}
            onIndexChange={setSheetIndex}
            header={
              <div className="pb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="h-12 w-12 shrink-0 overflow-hidden rounded-[12px] border-2"
                    style={{
                      borderColor: `hsl(${meta.hsl} / 0.6)`,
                      borderStyle:
                        isMural && mural?.status !== "APPROVED"
                          ? "dashed"
                          : "solid",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={target.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-hud truncate text-[16px] font-bold leading-tight text-ar-text">
                      {target.title}
                    </p>
                    <p className="truncate text-[12px] text-ar-faint">
                      {target.subtitle} ·{" "}
                      {formatDistance(distanceMeters(fix, target))} away
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-1.5">
                  {MODES.map(({ id: m, icon: Icon, label }) => {
                    const active = mode === m;
                    const t = modeTimes[m];
                    return (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        aria-pressed={active}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1 rounded-full border px-2 py-2 transition-colors",
                          active
                            ? "border-transparent bg-[#0f5c1c] text-white"
                            : "border-ar-line bg-white/[0.03] text-ar-dim",
                        )}
                      >
                        <Icon size={16} strokeWidth={2.2} />
                        <span className="font-hud whitespace-nowrap text-[11.5px] font-bold tabular-nums">
                          {t != null
                            ? formatDuration(t)
                            : routeLoading
                              ? "…"
                              : label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-end gap-3">
                  <div className="min-w-0 flex-1">
                    {routeLoading && !route ? (
                      <>
                        <Skeleton rounded="rounded-full" className="h-6 w-32" />
                        <Skeleton
                          rounded="rounded-full"
                          className="mt-2 h-3 w-44"
                        />
                      </>
                    ) : route ? (
                      <>
                        <p className="font-hud text-[24px] font-bold leading-none text-ar-green-hot">
                          {formatDuration(route.duration)}{" "}
                          <span className="text-[15px] font-medium text-ar-dim">
                            ({formatNavDistance(route.distance)})
                          </span>
                        </p>
                        <p className="mt-1.5 truncate text-[12px] text-ar-dim">
                          {route.id === fastest?.id
                            ? "Fastest route"
                            : `${Math.round((route.duration - (fastest?.duration ?? 0)) / 60)} min slower`}
                          {route.summary && <> · via {route.summary}</>}
                          {mode === "transit" && (
                            <> · {PROFILE_LABEL[route.profile]}</>
                          )}
                        </p>
                      </>
                    ) : routeError ? (
                      <p className="text-[12px] text-ar-danger">{routeError}</p>
                    ) : null}
                  </div>
                  <ArButton
                    variant="primary"
                    size="lg"
                    icon={Navigation}
                    disabled={!route}
                    onClick={start}
                  >
                    Start
                  </ArButton>
                </div>
              </div>
            }
          >
            {routes.length > 1 && (
              <p className="mb-2 text-[11.5px] text-ar-faint">
                {routes.length - 1} other route{routes.length > 2 ? "s" : ""} —
                tap a grey line on the map to switch
              </p>
            )}
            <p className="font-hud mb-2 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ar-faint">
              Navigation style
            </p>
            <StylePicker value={navStyle} onChange={setNavStyle} />
            {route && (
              <>
                <p className="font-hud mb-2 mt-4 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ar-faint">
                  Steps
                </p>
                {stepsList(route.steps)}
              </>
            )}
            <p className="mt-3 px-1 text-[11px] leading-relaxed text-ar-faint">
              {isMural
                ? `Get within ${MURAL_SCAN_FROM_M} m and scan it with the Murals camera to earn Wadzzo Coins.`
                : "Get close and this drop becomes collectible in AR."}
            </p>
          </DragSheet>
        )}
      </div>
    </AppShell>
  );
}

/** Classic (Google-style) vs Compass HUD. */
function StylePicker({
  value,
  onChange,
}: {
  value: NavStyle;
  onChange: (s: NavStyle) => void;
}) {
  const opts: { id: NavStyle; icon: LucideIcon; title: string; sub: string }[] =
    [
      {
        id: "classic",
        icon: MapIcon,
        title: "Classic",
        sub: "3D map, turn banner",
      },
      {
        id: "compass",
        icon: Gauge,
        title: "Compass",
        sub: "Dial + speed, time, distance",
      },
    ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {opts.map(({ id, icon: Icon, title, sub }) => {
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={on}
            className={cn(
              "flex items-center gap-2.5 rounded-[14px] border px-3 py-2.5 text-left transition-colors",
              on
                ? "bg-ar-green/12 border-ar-green/60"
                : "border-ar-line bg-white/[0.03]",
            )}
          >
            <Icon
              size={20}
              strokeWidth={2.2}
              className={on ? "text-ar-green-hot" : "text-ar-dim"}
            />
            <span className="min-w-0">
              <span
                className={cn(
                  "font-hud block text-[13px] font-bold",
                  on ? "text-ar-green-hot" : "text-ar-text",
                )}
              >
                {title}
              </span>
              <span className="block truncate text-[11px] text-ar-faint">
                {sub}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
