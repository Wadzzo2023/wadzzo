// Ported from wadzzoAR/src/lib/ar/navigation.ts (2026-10-06) — keep in sync with the web.
import type { Route, RouteStep, VoiceCue } from "./useDirections";

/**
 * ── Navigation maths ───────────────────────────────────────────────────────
 *
 * Pure helpers behind live navigation (no React, no platform APIs), shared
 * with the mobile app (copy in wadzzoWebAR-public — keep in sync):
 *
 *  - indexRoute   cumulative distances along the polyline + where each step starts
 *  - snapToRoute  nearest point on the route to a GPS fix, how far along, how far off
 *  - progressAt   current step, next manoeuvre, distance to it, what's left
 *  - splitRoute   the part already walked (greyed) and the part ahead
 *  - dueCue       which spoken cue (if any) is due right now
 */

type LngLat = [number, number];

export interface RouteIndex {
  coords: LngLat[];
  /** Metres from the start to each vertex. */
  cum: number[];
  total: number;
  /** Metres from the start to where each step begins (its manoeuvre). */
  stepStart: number[];
}

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LngLat, b: LngLat) {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing a → b, degrees clockwise from north. */
export function bearing(a: LngLat, b: LngLat) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function indexRoute(route: Route): RouteIndex {
  const coords = route.coordinates;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1]! + haversine(coords[i - 1]!, coords[i]!));
  const total = cum[cum.length - 1] ?? 0;
  // Step distances are Mapbox's along-road metres; scale to our polyline so
  // rounding differences can't push the last step past the end.
  const sum = route.steps.reduce((s, x) => s + x.distance, 0) || 1;
  const k = total / sum;
  const stepStart: number[] = [];
  let acc = 0;
  for (const s of route.steps) {
    stepStart.push(acc * k);
    acc += s.distance;
  }
  return { coords, cum, total, stepStart };
}

export interface Snap {
  /** The point on the route, `[lng, lat]`. */
  point: LngLat;
  /** Metres from the route start to `point`. */
  along: number;
  /** Metres from the fix to the route. */
  off: number;
  /** Segment index the point is on (between coords[seg] and coords[seg+1]). */
  seg: number;
  /** Direction of travel on that segment. */
  heading: number;
}

/**
 * Nearest point on the route. Local flat projection around the fix is plenty
 * at street scale (< 0.1% error over a few km). `hint` (the last snap's
 * `along`) keeps a route that doubles back from jumping to the wrong leg.
 */
export function snapToRoute(index: RouteIndex, fix: { lat: number; lng: number }, hint?: number): Snap | null {
  const { coords, cum } = index;
  if (coords.length < 2) return null;
  const kx = Math.cos(rad(fix.lat)) * 111_320;
  const ky = 110_540;
  const px = (c: LngLat) => (c[0] - fix.lng) * kx;
  const py = (c: LngLat) => (c[1] - fix.lat) * ky;
  let best: { d: number; seg: number; t: number } | null = null;
  for (let i = 0; i < coords.length - 1; i++) {
    const ax = px(coords[i]!), ay = py(coords[i]!);
    const bx = px(coords[i + 1]!), by = py(coords[i + 1]!);
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / len2)) : 0;
    const cx = ax + vx * t, cy = ay + vy * t;
    let d = Math.hypot(cx, cy);
    // Prefer staying near where we were: a small penalty for jumping far back.
    if (hint != null) {
      const along = cum[i]! + (cum[i + 1]! - cum[i]!) * t;
      if (along < hint - 40) d += (hint - 40 - along) * 0.5;
    }
    if (!best || d < best.d) best = { d, seg: i, t };
  }
  if (!best) return null;
  const a = coords[best.seg]!, b = coords[best.seg + 1]!;
  const point: LngLat = [a[0] + (b[0] - a[0]) * best.t, a[1] + (b[1] - a[1]) * best.t];
  return {
    point,
    along: cum[best.seg]! + (cum[best.seg + 1]! - cum[best.seg]!) * best.t,
    off: haversine([fix.lng, fix.lat], point),
    seg: best.seg,
    heading: bearing(a, b),
  };
}

export interface Progress {
  /** Index of the step being travelled. */
  step: number;
  /** The manoeuvre coming up (the next step's), if any. */
  next: RouteStep | null;
  /** And the one after it, for "Then ↰". */
  then: RouteStep | null;
  /** Metres to the next manoeuvre. */
  toNext: number;
  /** Metres from the next manoeuvre to the one after. */
  nextToThen: number;
  /** Metres / seconds left to the destination. */
  remaining: number;
  remainingTime: number;
}

export function progressAt(index: RouteIndex, route: Route, along: number): Progress {
  const { stepStart, total } = index;
  let step = 0;
  for (let i = 0; i < stepStart.length; i++) if (stepStart[i]! <= along + 1) step = i;
  const nextStart = stepStart[step + 1] ?? total;
  const thenStart = stepStart[step + 2] ?? total;
  const remaining = Math.max(0, total - along);
  return {
    step,
    next: route.steps[step + 1] ?? null,
    then: route.steps[step + 2] ?? null,
    toNext: Math.max(0, nextStart - along),
    nextToThen: Math.max(0, thenStart - nextStart),
    remaining,
    remainingTime: total ? route.duration * (remaining / total) : 0,
  };
}

/** The part already travelled and the part ahead, both ending/starting at the snap point. */
export function splitRoute(index: RouteIndex, snap: Snap): { done: LngLat[]; ahead: LngLat[] } {
  const { coords } = index;
  return {
    done: [...coords.slice(0, snap.seg + 1), snap.point],
    ahead: [snap.point, ...coords.slice(snap.seg + 1)],
  };
}

/**
 * The cue to speak now, if any. Mapbox puts a step's cues on the step
 * *before* the manoeuvre, keyed by metres before that step ends. Every cue
 * whose distance has already been passed is marked spoken, so a late GPS fix
 * says the most relevant line once instead of reading out the backlog.
 */
export function dueCue(route: Route, progress: Progress, spoken: Set<string>): VoiceCue | null {
  const cues = route.steps[progress.step]?.voice ?? [];
  let due: VoiceCue | null = null;
  for (const c of cues) {
    const key = `${route.id}:${progress.step}:${Math.round(c.distanceAlong)}`;
    if (spoken.has(key) || progress.toNext > c.distanceAlong + 5) continue;
    spoken.add(key);
    if (!due || c.distanceAlong < due.distanceAlong) due = c;
  }
  return due;
}

/** "150 m", "1.2 km" — rounded the way a driver reads it. */
export function formatNavDistance(m: number) {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km`;
  if (m >= 100) return `${Math.round(m / 50) * 50} m`;
  return `${Math.max(5, Math.round(m / 5) * 5)} m`;
}

export function formatDuration(s: number) {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
