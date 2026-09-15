import { useEffect, useState } from "react";

import type { Coords, TravelMode } from "./types";

/**
 * ── Mapbox Directions ──────────────────────────────────────────────────────
 *
 * Real road-following routes, replacing the straight bearing and the three
 * invented turns the screen used to draw.
 *
 * Ported from the main webapp's `play/map/direction` screen, which calls the
 * same endpoint with the same parameters.
 *
 * ── Transit ──
 * Mapbox Directions has no transit profile — it serves walking, cycling and
 * driving only. Rather than drop the mode or quietly alias it to walking,
 * "transit" races every profile and keeps whichever actually gets you there
 * soonest. On a short hop that's usually walking; across town it's driving.
 * The resolved profile is returned so the UI can say which one won instead of
 * claiming a bus it knows nothing about.
 */

const DIRECTIONS_URL = "https://api.mapbox.com/directions/v5/mapbox";

/** The profiles Mapbox actually serves. */
export type MapboxProfile = "walking" | "cycling" | "driving";

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

export interface RouteStep {
  /** Mapbox's own phrasing — "Turn left onto Jamgora Road". */
  instruction: string;
  /** `maneuver.type` + `modifier`, for picking an icon. */
  type: string;
  modifier?: string;
  distance: number;
  duration: number;
  name: string;
}

export interface Route {
  /** Metres along the road, not the crow-flies distance. */
  distance: number;
  /** Seconds, from Mapbox's own traffic-free model. */
  duration: number;
  /** `[lng, lat]` pairs, ready to hand to a GeoJSON source. */
  coordinates: [number, number][];
  steps: RouteStep[];
  /** Which profile produced this — the winner, when mode is transit. */
  profile: MapboxProfile;
}

interface MapboxRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs: {
    steps: {
      distance: number;
      duration: number;
      name: string;
      maneuver: { instruction: string; type: string; modifier?: string };
    }[];
  }[];
}

async function fetchProfile(
  profile: MapboxProfile,
  from: Coords,
  to: Coords,
  token: string,
  signal: AbortSignal,
): Promise<Route | null> {
  const url =
    `${DIRECTIONS_URL}/${profile}/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?geometries=geojson&steps=true&overview=full&access_token=${token}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    // 422 is Mapbox's "no route" (an island, a pedestrian-only lane for a
    // car). That's an answer, not a failure — the caller falls back.
    if (res.status === 422) return null;
    throw new Error(`Mapbox Directions failed (${res.status})`);
  }

  const json = (await res.json()) as { routes?: MapboxRoute[] };
  const route = json.routes?.[0];
  if (!route) return null;

  return {
    distance: route.distance,
    duration: route.duration,
    coordinates: route.geometry.coordinates,
    profile,
    steps: (route.legs ?? []).flatMap((leg) =>
      leg.steps.map((s) => ({
        instruction: s.maneuver.instruction,
        type: s.maneuver.type,
        modifier: s.maneuver.modifier,
        distance: s.distance,
        duration: s.duration,
        name: s.name,
      })),
    ),
  };
}

/**
 * One route from `from` to `to` for the chosen mode.
 *
 * Refetches whenever the mode or the destination changes, but deliberately not
 * on every GPS tick — a route that redraws each second is unreadable, and the
 * start point only matters to within a few metres. The caller passes a fix
 * that's already been coarsened.
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
  const [route, setRoute] = useState<Route | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Primitive deps, so an object identity change doesn't refetch a route that
  // hasn't actually moved.
  const fromLat = from?.lat ?? null;
  const fromLng = from?.lng ?? null;
  const toLat = to?.lat ?? null;
  const toLng = to?.lng ?? null;

  useEffect(() => {
    if (fromLat == null || fromLng == null || toLat == null || toLng == null) {
      return;
    }
    if (!token) {
      setError("No Mapbox token configured.");
      return;
    }

    const controller = new AbortController();
    const start = { lat: fromLat, lng: fromLng };
    const end = { lat: toLat, lng: toLng };

    setLoading(true);
    setError(null);

    const run = async () => {
      try {
        if (mode === "transit") {
          // No transit profile exists; race the real ones and keep the
          // fastest that actually returned a route.
          const results = await Promise.all(
            (["walking", "cycling", "driving"] as const).map((p) =>
              fetchProfile(p, start, end, token, controller.signal).catch(
                () => null,
              ),
            ),
          );
          const best = results
            .filter((r): r is Route => r !== null)
            .sort((a, b) => a.duration - b.duration)[0];
          setRoute(best ?? null);
          if (!best) setError("No route to this pin.");
        } else {
          const single = await fetchProfile(
            PROFILE_FOR[mode],
            start,
            end,
            token,
            controller.signal,
          );
          setRoute(single);
          if (!single) setError("No route to this pin for that mode.");
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Could not load directions.");
        setRoute(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void run();
    return () => controller.abort();
  }, [fromLat, fromLng, toLat, toLng, mode, token]);

  return { route, isLoading, error };
}
