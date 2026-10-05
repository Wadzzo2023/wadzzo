import {
  ArrowUp,
  Bike,
  Bus,
  Car,
  ChevronLeft,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Footprints,
  MapPin,
  Merge,
  RotateCcw,
  Split,
} from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import MapGL, { Layer, Marker, Source } from "react-map-gl";

import { AppShell } from "~/components/shell/AppShell";
import { LocationGate } from "~/components/shell/LocationGate";
import { ArLinkButton } from "~/components/ui/ArButton";
import { Skeleton } from "~/components/ui/Skeleton";
import {
  AR_CAPTURE_RADIUS,
  distanceMeters,
  formatDistance,
} from "~/lib/ar/geo";
import { RARITY_META } from "~/lib/ar/rarity";
import { MAP_STYLE, useResolvedTheme } from "~/lib/ar/theme";
import type { TravelMode } from "~/lib/ar/types";
import {
  PROFILE_LABEL,
  useDirections,
  type RouteStep,
} from "~/lib/ar/useDirections";
import { useGeolocation } from "~/lib/ar/useGeolocation";
import { usePins } from "~/lib/ar/usePins";
import { api } from "~/utils/api";
import { cn } from "~/lib/utils";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API;

const MODES: { id: TravelMode; icon: typeof Bike; label: string }[] = [
  { id: "walk", icon: Footprints, label: "Walk" },
  { id: "cycle", icon: Bike, label: "Cycle" },
  { id: "transit", icon: Bus, label: "Transit" },
  { id: "drive", icon: Car, label: "Drive" },
];

const TRAVEL_MODES: TravelMode[] = ["walk", "cycle", "transit", "drive"];

/** Narrows an untrusted query param — a URL can say anything. */
function isTravelMode(v: unknown): v is TravelMode {
  return typeof v === "string" && (TRAVEL_MODES as string[]).includes(v);
}

/**
 * Mapbox describes a turn as a `type` plus an optional `modifier`; the
 * modifier is the part that says which way, so it wins where both apply.
 */
function stepIcon(step: RouteStep) {
  if (step.type === "arrive") return MapPin;
  if (step.type === "depart") return ArrowUp;
  if (step.type === "roundabout" || step.type === "rotary") return RotateCcw;
  if (step.type === "merge") return Merge;
  if (step.type === "fork") return Split;

  const m = step.modifier ?? "";
  if (m.includes("left")) return CornerUpLeft;
  if (m.includes("right")) return CornerUpRight;
  if (m === "uturn") return RotateCcw;
  return ArrowUp;
}

/**
 * ── /directions/[id] ───────────────────────────────────────────────────────
 *
 * How to get to a pin, by whichever mode you're actually using.
 *
 * The route, distance, ETA and turn-by-turn all come from Mapbox Directions
 * (see `useDirections`) — road-following, not a bearing.
 *
 * Mapbox has no transit profile, so "Transit" races walking, cycling and
 * driving and keeps whichever is genuinely fastest, then says which one won.
 * Promising a bus the API knows nothing about would be worse than useless to
 * someone standing on a street corner.
 */
/** Murals are scannable from this far (matches MuralSheet). */
const MURAL_SCAN_FROM_M = 100;

export default function DirectionsScreen() {
  const router = useRouter();
  const theme = useResolvedTheme();
  const id = typeof router.query.id === "string" ? router.query.id : null;
  // `?kind=mural`: route to a mural instead of a drop (same screen, epic purple).
  const isMural = router.query.kind === "mural";

  const {
    fix,
    status: geoStatus,
    reason: geoReason,
    retry: retryLocation,
  } = useGeolocation();
  const pins = usePins();
  const [mode, setMode] = useState<TravelMode>("walk");

  // `router.query` is empty on the first render of a directly-loaded page —
  // Next only populates it once the route resolves. Seeding `useState` from it
  // therefore threw away whatever `?mode=` said, and the map sheet's
  // "Directions · Cycle" always arrived here as Walk. Adopt it once, when it
  // actually shows up, and never again so a later tap isn't overridden.
  const modeFromUrl = router.query.mode;
  const adoptedUrlMode = useRef(false);
  useEffect(() => {
    if (adoptedUrlMode.current || !router.isReady) return;
    adoptedUrlMode.current = true;
    if (isTravelMode(modeFromUrl)) setMode(modeFromUrl);
  }, [router.isReady, modeFromUrl]);

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

  // Coarsened to ~11 m so a jittering GPS fix doesn't refetch (and redraw) the
  // route on every tick. The start of a route doesn't need metre precision.
  const origin = useMemo(
    () =>
      fix
        ? {
            lat: Math.round(fix.lat * 1e4) / 1e4,
            lng: Math.round(fix.lng * 1e4) / 1e4,
          }
        : null,
    [fix],
  );

  const {
    route,
    isLoading: routeLoading,
    error: routeError,
  } = useDirections({
    from: origin,
    to: target ? { lat: target.lat, lng: target.lng } : null,
    mode,
    token: MAPBOX_TOKEN,
  });

  // Straight-line distance is the honest fallback while the route loads or if
  // Mapbox can't serve one — it's a real number, just a different one, and the
  // UI labels it as direct.
  const crowFlies = target && fix ? distanceMeters(fix, target) : 0;
  const distance = route?.distance ?? crowFlies;
  const minutes = route ? Math.max(1, Math.round(route.duration / 60)) : null;

  const routeGeoJson = useMemo(() => {
    if (!route) return null;
    return {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: route.coordinates,
      },
    };
  }, [route]);

  // Directions from nowhere aren't directions. Gate before anything else so
  // the screen never draws a route out of a guessed origin.
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

  if (!target) {
    return (
      <AppShell>
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          {isMural && muralQuery.isLoading ? (
            <Skeleton className="h-6 w-40 rounded-full" />
          ) : (
            <>
              <p className="font-hud text-[15px] font-bold uppercase tracking-[0.12em] text-ar-dim">
                {isMural ? "Mural not found" : "Pin not found"}
              </p>
              <ArLinkButton href="/map" variant="primary" size="md">
                Back to the map
              </ArLinkButton>
            </>
          )}
        </div>
      </AppShell>
    );
  }

  const meta = RARITY_META[isMural ? "epic" : pin!.rarity];

  return (
    <AppShell tabs={false}>
      <div className="relative flex h-full flex-col">
        {/* ── Map ──────────────────────────────────────────────────── */}
        <div className="relative h-[46%]">
          {MAPBOX_TOKEN ? (
            <MapGL
              mapboxAccessToken={MAPBOX_TOKEN}
              initialViewState={{
                longitude: (fix.lng + target.lng) / 2,
                latitude: (fix.lat + target.lat) / 2,
                zoom: 14.6,
                pitch: 40,
              }}
              mapStyle={MAP_STYLE[theme]}
              attributionControl={false}
              style={{ width: "100%", height: "100%" }}
            >
              {routeGeoJson && (
                <Source id="route" type="geojson" data={routeGeoJson}>
                  <Layer
                    id="route-glow"
                    type="line"
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{
                      "line-color": "hsl(115,68%,52%)",
                      "line-width": 12,
                      "line-opacity": 0.22,
                      "line-blur": 6,
                    }}
                  />
                  <Layer
                    id="route-line"
                    type="line"
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{
                      "line-color": "hsl(110,90%,64%)",
                      "line-width": 3.5,
                    }}
                  />
                </Source>
              )}

              <Marker longitude={fix.lng} latitude={fix.lat} anchor="center">
                <span className="block h-4 w-4 rounded-full bg-ar-green-hot ring-[3px] ring-white/90" />
              </Marker>

              <Marker
                longitude={target.lng}
                latitude={target.lat}
                anchor="center"
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2"
                  style={{
                    borderColor: `hsl(${meta.hsl})`,
                    background: "hsl(var(--ar-void)/0.85)",
                    boxShadow: `0 0 20px hsl(${meta.hsl})`,
                  }}
                >
                  <Flag
                    size={13}
                    strokeWidth={2.6}
                    style={{ color: `hsl(${meta.hsl})` }}
                  />
                </span>
              </Marker>
            </MapGL>
          ) : (
            <div className="ar-grid flex h-full items-center justify-center bg-ar-surface">
              <p className="font-hud text-[11px] uppercase tracking-[0.18em] text-ar-faint">
                Map preview
              </p>
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(6,16,10,0.6)_0%,transparent_30%,transparent_70%,hsl(var(--ar-bg))_100%)]" />

          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="ar-glass absolute left-4 flex h-9 items-center gap-1 rounded-full pl-1.5 pr-3 text-ar-text"
            style={{ top: "calc(var(--ar-top-inset) + 14px)" }}
          >
            <ChevronLeft size={17} strokeWidth={2.4} />
            <span className="font-hud text-[10px] font-semibold uppercase tracking-[0.14em]">
              Back
            </span>
          </button>
        </div>

        {/* ── Sheet ────────────────────────────────────────────────── */}
        <div className="ar-scroll relative -mt-6 flex-1 rounded-t-ar-xl border-t border-ar-line bg-ar-bg px-5 pt-4">
          <div className="mb-3 flex items-start gap-3">
            <div
              className="h-[52px] w-[38px] shrink-0 overflow-hidden rounded-[9px] border"
              style={{
                borderColor: `hsl(${meta.hsl}/0.55)`,
                borderStyle:
                  isMural && mural?.status !== "APPROVED" ? "dashed" : "solid",
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
              <h1 className="font-hud truncate text-[16px] font-bold leading-tight text-ar-text">
                {target.title}
              </h1>
              <p className="mt-0.5 truncate text-[11.5px] text-ar-faint">
                {target.subtitle}
              </p>
            </div>
          </div>

          {/* Modes */}
          <div className="grid grid-cols-4 gap-1.5">
            {MODES.map(({ id: m, icon: Icon, label }) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-[12px] border px-1 py-2.5 transition-colors",
                    active
                      ? "bg-ar-green/12 border-ar-green/60 text-ar-green-hot"
                      : "border-ar-line bg-white/[0.03] text-ar-faint",
                  )}
                >
                  <Icon size={17} strokeWidth={2.1} />
                  {/* Only the selected mode has a routed ETA — the others
                      would need three more Directions calls, and guessing
                      them from a speed constant is what this screen just
                      stopped doing. */}
                  <span className="font-hud text-[13px] font-bold tabular-nums leading-none">
                    {active && minutes !== null ? (
                      <>
                        {minutes}
                        <span className="text-[9px] font-medium"> min</span>
                      </>
                    ) : (
                      <span className="text-ar-faint">&middot;</span>
                    )}
                  </span>
                  <span className="font-hud text-[8px] uppercase tracking-[0.12em]">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Summary */}
          {routeLoading && !route ? (
            <div className="ar-bevel mt-3.5 flex items-center justify-between rounded-ar px-4 py-3">
              <div>
                <Skeleton rounded="rounded-full" className="h-6 w-20" />
                <Skeleton rounded="rounded-full" className="mt-2 h-2.5 w-24" />
              </div>
              <div className="flex flex-col items-end">
                <Skeleton rounded="rounded-full" className="h-3.5 w-14" />
                <Skeleton rounded="rounded-full" className="mt-2 h-2.5 w-10" />
              </div>
            </div>
          ) : (
            <div className="ar-bevel mt-3.5 flex items-center justify-between rounded-ar px-4 py-3">
              <div>
                <p className="font-hud text-glow-soft text-[22px] font-bold tabular-nums leading-none text-ar-green-hot">
                  {minutes ?? "—"}
                  <span className="text-[12px] font-medium text-ar-dim">
                    {" "}
                    min
                  </span>
                </p>
                <p className="font-hud mt-1 text-[9.5px] uppercase tracking-[0.16em] text-ar-faint">
                  {formatDistance(distance)}
                  {route ? " by road" : " direct"}
                  {/* Transit resolved to a real profile — say which, rather
                      than implying a bus service we never checked. */}
                  {route && mode === "transit" && (
                    <> &middot; {PROFILE_LABEL[route.profile]}</>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="font-hud text-[12px] font-bold text-ar-text">
                  {minutes !== null
                    ? new Date(
                        Date.now() + minutes * 60_000,
                      ).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "—"}
                </p>
                <p className="font-hud mt-1 text-[9.5px] uppercase tracking-[0.16em] text-ar-faint">
                  Arrive
                </p>
              </div>
            </div>
          )}

          {routeError && (
            <div className="mt-3 rounded-ar border border-ar-danger/40 bg-ar-danger/10 px-3.5 py-2.5">
              <p className="text-[12px] leading-relaxed text-ar-danger">
                {routeError} Showing the direct line instead.
              </p>
            </div>
          )}

          {/* Steps */}
          <h2 className="font-hud mb-2 mt-5 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ar-faint">
            Route
          </h2>
          {routeLoading && !route ? (
            <div className="ar-bevel divide-y divide-ar-line rounded-ar">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3.5 py-3">
                  <Skeleton
                    className="h-8 w-8 shrink-0"
                    rounded="rounded-[10px]"
                  />
                  <Skeleton rounded="rounded-full" className="h-2.5 flex-1" />
                  <Skeleton
                    rounded="rounded-full"
                    className="h-2.5 w-10 shrink-0"
                  />
                </div>
              ))}
            </div>
          ) : route && route.steps.length > 0 ? (
            <ol className="ar-bevel divide-y divide-ar-line rounded-ar">
              {route.steps.map((step, i) => {
                const Icon = stepIcon(step);
                return (
                  <li key={i} className="flex items-center gap-3 px-3.5 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-ar-line bg-white/[0.04] text-ar-dim">
                      <Icon size={14} strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 flex-1 text-[12.5px] text-ar-text">
                      {step.instruction}
                    </span>
                    {step.distance > 0 && (
                      <span className="font-hud shrink-0 text-[11px] font-bold tabular-nums text-ar-faint">
                        {formatDistance(step.distance)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="ar-bevel rounded-ar px-3.5 py-4 text-center">
              <p className="text-[12px] text-ar-faint">
                No turn-by-turn for this route — head {formatDistance(distance)}{" "}
                toward the {isMural ? "mural" : "pin"}.
              </p>
            </div>
          )}

          <p className="mt-3 px-1 text-[11px] leading-relaxed text-ar-faint">
            {isMural
              ? `Get within ${MURAL_SCAN_FROM_M} m and scan it with the Murals camera to earn Wadzzo Coins.`
              : `Get within ${AR_CAPTURE_RADIUS} m and this pin becomes capturable in AR.`}
          </p>

          <div className="py-5">
            <ArLinkButton href="/map" variant="primary" size="lg" block>
              Back to the map
            </ArLinkButton>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
