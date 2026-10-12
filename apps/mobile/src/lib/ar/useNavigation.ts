// Ported from wadzzoAR/src/lib/ar/useNavigation.ts (2026-10-06) — keep in sync with the web.
import { useEffect, useMemo, useRef } from "react";

import { dueCue, indexRoute, progressAt, snapToRoute, splitRoute } from "./navigation";
import type { Route } from "./useDirections";

/** Further than this from the route counts as off it… */
const OFF_ROUTE_M = 35;
/** …for this many fixes in a row (one bad fix isn't a wrong turn). */
const OFF_ROUTE_FIXES = 3;
/** And never reroute more often than this. */
const REROUTE_COOLDOWN_MS = 12_000;
/** Within this of the end (along the road, or straight-line) = arrived. */
const ARRIVE_M = 18;
/** Buzz once when the next turn gets this close. */
const TURN_SOON_M = 40;

/**
 * ── useNavigation ──────────────────────────────────────────────────────────
 *
 * Live turn-by-turn on top of a Route: snaps each GPS fix onto it, works out
 * the next manoeuvre and what's left, splits the line into walked / ahead,
 * speaks Mapbox's cues at the right distance, buzzes before a turn, asks for
 * a reroute after a few fixes clearly off the route, and says when you've
 * arrived. Platform bits (speech, haptics) come in as callbacks so the web
 * and the app share this file (mobile keeps a copy in sync).
 */
export function useNavigation({
  route,
  fix,
  active,
  muted,
  speak,
  buzz,
  onReroute,
}: {
  route: Route | null;
  fix: { lat: number; lng: number; accuracy?: number } | null;
  active: boolean;
  muted: boolean;
  speak: (text: string) => void;
  buzz: () => void;
  onReroute: (from: { lat: number; lng: number }) => void;
}) {
  const index = useMemo(() => (route ? indexRoute(route) : null), [route]);

  const state = useMemo(() => {
    if (!active || !route || !index || !fix) return null;
    const snap = snapToRoute(index, fix);
    if (!snap) return null;
    const progress = progressAt(index, route, snap.along);
    const end = index.coords[index.coords.length - 1]!;
    const toEnd = Math.hypot((end[0] - fix.lng) * Math.cos((fix.lat * Math.PI) / 180) * 111_320, (end[1] - fix.lat) * 110_540);
    return {
      snap,
      progress,
      ...splitRoute(index, snap),
      arrived: progress.remaining < ARRIVE_M || toEnd < ARRIVE_M,
      // Poor GPS shouldn't count as "off route".
      offRoute: snap.off > Math.max(OFF_ROUTE_M, (fix.accuracy ?? 0) * 1.5),
    };
  }, [active, route, index, fix]);

  // New route (start / reroute / alternative) → fresh cue memory.
  const spoken = useRef(new Set<string>());
  useEffect(() => {
    spoken.current = new Set();
  }, [route]);

  // Voice + haptics.
  const buzzedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!state || !route || state.arrived) return;
    const cue = dueCue(route, state.progress, spoken.current);
    if (cue && !muted) speak(cue.text);
    const key = `${route.id}:${state.progress.step}`;
    if (state.progress.next && state.progress.toNext < TURN_SOON_M && buzzedFor.current !== key) {
      buzzedFor.current = key;
      buzz();
    }
  }, [state, route, muted, speak, buzz]);

  // Arrival: say it once.
  const announcedArrival = useRef(false);
  useEffect(() => {
    if (!active) announcedArrival.current = false;
    if (state?.arrived && !announcedArrival.current) {
      announcedArrival.current = true;
      buzz();
      if (!muted) speak("You have arrived.");
    }
  }, [active, state?.arrived, muted, speak, buzz]);

  // Off route → reroute from here (debounced and rate-limited).
  const offCount = useRef(0);
  const lastReroute = useRef(0);
  useEffect(() => {
    if (!state || !fix || state.arrived) return;
    offCount.current = state.offRoute ? offCount.current + 1 : 0;
    if (offCount.current >= OFF_ROUTE_FIXES && Date.now() - lastReroute.current > REROUTE_COOLDOWN_MS) {
      offCount.current = 0;
      lastReroute.current = Date.now();
      onReroute({ lat: fix.lat, lng: fix.lng });
    }
  }, [state, fix, onReroute]);

  return state;
}
