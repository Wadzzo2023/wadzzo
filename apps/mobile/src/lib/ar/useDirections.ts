// Ported from wadzzoAR/src/lib/ar/useDirections.ts (2026-10-06) — keep in sync with the web.
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Coords, TravelMode } from "./types";

/**
 * ── Mapbox Directions ──────────────────────────────────────────────────────
 *
 * Road-following routes for the Google-Maps-style directions screen
 * (preview → live navigation, see `navigation.ts`).
 *
 * One fetch per profile (walking, cycling, driving), all three in parallel,
 * each with up to two alternatives, Mapbox's spoken cues and banner text.
 * That fills every mode chip with a real time and makes switching modes
 * instant. Mobile keeps a copy in sync (wadzzoWebAR-public).
 *
 * ── Transit ──
 * Mapbox Directions has no transit profile. "Transit" is whichever real
 * profile gets you there soonest; the UI says which one won rather than
 * promising a bus it knows nothing about.
 */

const DIRECTIONS_URL = "https://api.mapbox.com/directions/v5/mapbox";

/** The profiles Mapbox actually serves. */
export type MapboxProfile = "walking" | "cycling" | "driving";

const PROFILES: MapboxProfile[] = ["walking", "cycling", "driving"];

const PROFILE_FOR: Record<Exclude<TravelMode, "transit">, MapboxProfile> = {
  walk: "walking",
  cycle: "cycling",
  drive: "driving",
};

export const PROFILE_LABEL: Record<MapboxProfile, string> = {
  walking: "on foot",
  cycling: "by bike",
  driving: "by car",
};

/** Something to say before the end of a step — "In 200 metres, turn right". */
export interface VoiceCue {
  /** Metres before the END of the step at which to say it. */
  distanceAlong: number;
  text: string;
}

export interface RouteStep {
  /** Mapbox's own phrasing — "Turn left onto Jamgora Road". */
  instruction: string;
  /**
   * Mapbox's banner text for the manoeuvre at the END of this step (i.e. the
   * next step's turn) — "Jamgora Road", "Turn right". Show it while
   * travelling this step. Empty when Mapbox gives none.
   */
  banner: string;
  /** `maneuver.type` + `modifier`, for picking an icon. */
  type: string;
  modifier?: string;
  distance: number;
  duration: number;
  name: string;
  /** Where the manoeuvre happens, `[lng, lat]`. */
  location: [number, number];
  voice: VoiceCue[];
}

export interface Route {
  /** Stable within one response: `${profile}-${index}`. */
  id: string;
  /** Metres along the road, not the crow-flies distance. */
  distance: number;
  /** Seconds, from Mapbox's own traffic-free model. */
  duration: number;
  /** `[lng, lat]` pairs, ready to hand to a GeoJSON source. */
  coordinates: [number, number][];
  steps: RouteStep[];
  profile: MapboxProfile;
  /** Main roads, for "via Mirpur Road". */
  summary: string;
}

interface MapboxStep {
  distance: number;
  duration: number;
  name: string;
  maneuver: { instruction: string; type: string; modifier?: string; location: [number, number] };
  voiceInstructions?: { distanceAlongGeometry: number; announcement: string }[];
  bannerInstructions?: { primary?: { text?: string } }[];
}

interface MapboxRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs: { summary?: string; steps: MapboxStep[] }[];
}

/** First non-empty string — Mapbox leaves names as "" rather than omitting them. */
export const firstText = (...xs: (string | undefined)[]) => xs.find((x) => x?.trim()) ?? "";

async function fetchProfile(
  profile: MapboxProfile,
  from: Coords,
  to: Coords,
  token: string,
  signal: AbortSignal,
): Promise<Route[]> {
  const url =
    `${DIRECTIONS_URL}/${profile}/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?alternatives=true&geometries=geojson&steps=true&overview=full` +
    `&voice_instructions=true&voice_units=metric&banner_instructions=true&language=en` +
    `&access_token=${token}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    // 422 is Mapbox's "no route" (an island, a pedestrian-only lane for a
    // car). That's an answer, not a failure — the caller falls back.
    if (res.status === 422) return [];
    throw new Error(`Mapbox Directions failed (${res.status})`);
  }

  const json = (await res.json()) as { routes?: MapboxRoute[] };
  return (json.routes ?? []).map((r, i) => ({
    id: `${profile}-${i}`,
    distance: r.distance,
    duration: r.duration,
    coordinates: r.geometry.coordinates,
    profile,
    summary: (r.legs ?? []).map((l) => l.summary).filter(Boolean).join(", "),
    steps: (r.legs ?? []).flatMap((leg) =>
      leg.steps.map((s) => ({
        instruction: s.maneuver.instruction,
        banner: firstText(s.bannerInstructions?.[0]?.primary?.text),
        type: s.maneuver.type,
        modifier: s.maneuver.modifier,
        distance: s.distance,
        duration: s.duration,
        name: s.name,
        location: s.maneuver.location,
        voice: (s.voiceInstructions ?? []).map((v) => ({ distanceAlong: v.distanceAlongGeometry, text: v.announcement })),
      })),
    ),
  }));
}

export type ModeTimes = Record<TravelMode, number | null>;

/**
 * Routes from `from` to `to` for every mode at once; `routes` / `route` are
 * the chosen mode's (fastest first), `select` picks an alternative.
 *
 * Refetches when the origin or destination changes — the caller decides when
 * the origin moves (on start, and on a reroute), never on every GPS tick.
 */
export function useDirections({
  from,
  to,
  mode,
  token,
}: {
  from: Coords | null;
  to: Coords | null;
  mode: TravelMode;
  token: string | undefined;
}) {
  // Primitive key, so an object identity change doesn't refetch.
  const key = from && to ? `${from.lat},${from.lng}>${to.lat},${to.lng}` : null;
  // Results remember which request they answer: loading is "the newest
  // answer is for an older key", and the previous routes stay on screen
  // (e.g. during a reroute) until the new ones land.
  const [result, setResult] = useState<{ key: string; byProfile: Record<MapboxProfile, Route[]> } | null>(null);
  const [picked, setPicked] = useState<{ key: string; id: string } | null>(null);

  useEffect(() => {
    if (!key || !token || !from || !to) return;
    const controller = new AbortController();
    const start = { lat: from.lat, lng: from.lng };
    const end = { lat: to.lat, lng: to.lng };
    void Promise.all(PROFILES.map((p) => fetchProfile(p, start, end, token, controller.signal).catch(() => [] as Route[]))).then(
      ([walking, cycling, driving]) => {
        if (!controller.signal.aborted) setResult({ key, byProfile: { walking: walking!, cycling: cycling!, driving: driving! } });
      },
    );
    return () => controller.abort();
    // `key` encodes from/to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, token]);

  const byProfile = result?.byProfile ?? null;
  const isLoading = Boolean(key && token && result?.key !== key);
  const select = useCallback((id: string) => setPicked(result ? { key: result.key, id } : null), [result]);

  const routes = useMemo<Route[]>(() => {
    if (!byProfile) return [];
    if (mode !== "transit") return byProfile[PROFILE_FOR[mode]];
    // Fastest real profile wins; its alternatives come with it.
    const best = PROFILES.map((p) => byProfile[p]).filter((r) => r.length).sort((a, b) => a[0]!.duration - b[0]!.duration)[0];
    return best ?? [];
  }, [byProfile, mode]);

  const modeTimes = useMemo<ModeTimes>(() => {
    const t = (p: MapboxProfile) => byProfile?.[p][0]?.duration ?? null;
    const all = PROFILES.map(t).filter((x): x is number => x != null);
    return { walk: t("walking"), cycle: t("cycling"), drive: t("driving"), transit: all.length ? Math.min(...all) : null };
  }, [byProfile]);

  const route = routes.find((r) => picked?.key === result?.key && r.id === picked?.id) ?? routes[0] ?? null;
  const nothing = byProfile && !byProfile.walking.length && !byProfile.cycling.length && !byProfile.driving.length;

  return {
    routes,
    route,
    select,
    modeTimes,
    isLoading,
    error: !token ? "No Mapbox token configured." : nothing ? "No route to this place." : byProfile && !routes.length ? "No route for that mode." : null,
  };
}
