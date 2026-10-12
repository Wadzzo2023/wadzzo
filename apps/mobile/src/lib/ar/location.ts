import * as Location from "expo-location";
import { useEffect } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { create } from "zustand";

import { distanceMeters } from "./geo";
import type { GeoFix } from "./types";

/**
 * ── Location ───────────────────────────────────────────────────────────────
 *
 * Native counterpart of the web's `useGeolocation`: the same status/reason
 * model and wording, on `expo-location`. Foreground only (decided).
 *
 * ONE shared GPS watch for the whole app (map, AR, Murals, Directions all
 * read the same store), started by the first screen that needs it and
 * stopped shortly after the last one goes away. Built to fix what made the
 * app feel like it was reloading (Android especially, 2026-10-06):
 *
 *  - instant first position: the phone's last known fix is shown at once,
 *    then a quick network fix, then the GPS watch refines it;
 *  - permission is only *requested* when not already granted, and Android's
 *    "improve location accuracy" dialog is offered ONCE per launch here
 *    rather than by every watch start — each system dialog backgrounds the
 *    app on Android, and restarting the watch on every return looped;
 *  - every start bumps a generation, so an older start that finishes late
 *    removes its own watch instead of leaking it;
 *  - calmer updates: high (not navigation) accuracy, every 2 s / 3 m, and
 *    fixes that barely moved are dropped, so the map isn't re-rendered for
 *    GPS jitter while you stand still.
 */

export type GeoStatus = "idle" | "prompting" | "tracking" | "denied" | "unavailable";
export type GeoReason = "denied" | "unavailable" | "timeout";

export const GEO_REASON_TEXT: Record<GeoReason, string> = {
  denied: "Location is turned off for Wadzzo. Allow it in Settings and Wadzzo can show the drops around you.",
  unavailable: "Your phone couldn't get a location fix. Check that Location Services are on.",
  timeout: "Location is taking a long time to arrive. Move somewhere with a clearer view of the sky and try again.",
};

/** Same fallback centre as the web, used only to frame the map pre-fix. */
export const FALLBACK_CENTER = { lat: 23.94026782931064, lng: 90.29786059328437 };

type GeoState = {
  fix: GeoFix | null;
  status: GeoStatus;
  reason: GeoReason | null;
  /** false = Android "Approximate" was chosen (drops need precise). */
  precise: boolean;
};

const useGeo = create<GeoState>()(() => ({ fix: null, status: "idle", reason: null, precise: true }));
const setGeo = (p: Partial<GeoState>) => useGeo.setState(p);

/** A fix older than this from the OS cache is still shown, just refined. */
const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000;
const TIMEOUT_MS = 15_000;
/** Keep the watch alive briefly between screens (map → AR → back). */
const RELEASE_GRACE_MS = 1500;

let users = 0;
let generation = 0;
let watch: Location.LocationSubscription | null = null;
let timeout: ReturnType<typeof setTimeout> | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
let appSub: { remove: () => void } | null = null;
let appState: AppStateStatus = AppState.currentState;
/** A system dialog of ours is up; the background/active it causes is not a real one. */
let inDialog = false;
let askedAccuracy = false;

function toFix(p: Location.LocationObject): GeoFix {
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy: p.coords.accuracy ?? 50,
    heading: p.coords.heading != null && p.coords.heading >= 0 ? p.coords.heading : null,
    speed: p.coords.speed,
    timestamp: p.timestamp,
    mocked: p.mocked === true,
  };
}

/** Publish a fix unless it's just jitter on the one we already have. */
function publish(next: GeoFix) {
  const prev = useGeo.getState().fix;
  if (prev && next.timestamp < prev.timestamp) return;
  if (prev) {
    const moved = distanceMeters(prev, next);
    const sharper = prev.accuracy - next.accuracy >= 5;
    const stale = next.timestamp - prev.timestamp >= 10_000;
    if (moved < Math.max(2, next.accuracy * 0.2) && !sharper && !stale) return;
  }
  if (timeout) clearTimeout(timeout);
  timeout = null;
  setGeo({ fix: next, status: "tracking", reason: null });
}

function stopWatch() {
  watch?.remove();
  watch = null;
  if (timeout) clearTimeout(timeout);
  timeout = null;
}

async function withDialog<T>(fn: () => Promise<T>): Promise<T> {
  inDialog = true;
  try {
    return await fn();
  } finally {
    // The "active" event lands just after the dialog closes.
    setTimeout(() => {
      inDialog = false;
    }, 800);
  }
}

async function begin() {
  const my = ++generation;
  stopWatch();
  const { status } = useGeo.getState();
  if (status !== "tracking") setGeo({ status: "prompting" });

  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted" && perm.canAskAgain) perm = await withDialog(() => Location.requestForegroundPermissionsAsync());
    if (my !== generation) return;
    if (perm.status !== "granted") {
      setGeo({ status: "denied", reason: "denied" });
      return;
    }
    setGeo({ precise: Platform.OS !== "android" || perm.android?.accuracy !== "coarse" });

    if (!(await Location.hasServicesEnabledAsync())) {
      if (my === generation) setGeo({ status: "unavailable", reason: "unavailable" });
      return;
    }

    // Android: offer "improve location accuracy" once per launch, here —
    // never from inside the watch (that's what looped).
    if (Platform.OS === "android" && !askedAccuracy) {
      askedAccuracy = true;
      const providers = await Location.getProviderStatusAsync().catch(() => null);
      if (providers && !providers.networkAvailable) await withDialog(() => Location.enableNetworkProviderAsync()).catch(() => undefined);
      if (my !== generation) return;
    }

    // Instant: whatever the phone already knows, then a quick network fix.
    const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }).catch(() => null);
    if (my !== generation) return;
    if (last) publish(toFix(last));
    void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false })
      .then((p) => {
        if (my === generation) publish(toFix(p));
      })
      .catch(() => undefined);

    if (!useGeo.getState().fix) {
      timeout = setTimeout(() => {
        if (my === generation && !useGeo.getState().fix) setGeo({ reason: "timeout" });
      }, TIMEOUT_MS);
    }

    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 3, mayShowUserSettingsDialog: false },
      (p) => {
        if (my === generation) publish(toFix(p));
      },
    );
    // A newer start (or the last screen leaving) happened while we waited.
    if (my !== generation || users === 0) {
      sub.remove();
      return;
    }
    watch = sub;
  } catch {
    if (my === generation && !useGeo.getState().fix) setGeo({ status: "unavailable", reason: "unavailable" });
  }
}

function onAppState(next: AppStateStatus) {
  const prev = appState;
  appState = next;
  if (inDialog) return;
  if (next === "background") {
    generation++;
    stopWatch();
  } else if (next === "active" && prev === "background" && users > 0) {
    void begin();
  }
}

function acquire() {
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  users += 1;
  if (users > 1) return;
  if (!appSub) appSub = AppState.addEventListener("change", onAppState);
  if (!watch) void begin();
}

function release() {
  users = Math.max(0, users - 1);
  if (users > 0) return;
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    if (users > 0) return;
    generation++;
    stopWatch();
    appSub?.remove();
    appSub = null;
  }, RELEASE_GRACE_MS);
}

/** Retry from the gate ("Enable location" / "I've turned it on"). */
const retry = () => void begin();

export function useGeolocation({ enabled = true }: { enabled?: boolean } = {}) {
  const fix = useGeo((s) => s.fix);
  const status = useGeo((s) => s.status);
  const reason = useGeo((s) => s.reason);
  const precise = useGeo((s) => s.precise);
  useEffect(() => {
    if (!enabled) return;
    acquire();
    return release;
  }, [enabled]);
  return { fix, status, reason, precise, retry };
}

/**
 * Compass heading in degrees (true north when available). iOS refuses the
 * heading watch until location is allowed, so callers pass `enabled` only
 * once permission is granted; any other failure just means no compass.
 */
/**
 * Throttled: iOS delivers heading many times a second even in a still hand,
 * and every update re-rendered the whole screen using it (the map screen:
 * canvas, markers' parent, nearby rail, pin sheet). That kept the JS thread
 * saturated — a 10 s "VirtualizedList is slow to update" stall and the map
 * freezing. Now: at most every HEADING_MS, and only for a real turn.
 */
const HEADING_MS = 100;
const HEADING_MIN_DEG = 2;

/**
 * ONE native heading watch for the whole app. expo-location on Android keeps
 * a single heading watch (`mHeadingId`): a second `watchHeadingAsync` (e.g.
 * Directions or AR opened over the map) replaced the map's, and removing it
 * on leave shut the sensor off — the map's compass froze until restart.
 * Screens now share this store; the watch stops when the last one leaves.
 */
const useHeadingStore = create<{ heading: number | null; accuracy: number | null }>()(() => ({ heading: null, accuracy: null }));
let headingUsers = 0;
let headingGen = 0;
let headingSub: Location.LocationSubscription | null = null;
let headingRelease: ReturnType<typeof setTimeout> | null = null;

function startHeading() {
  const my = ++headingGen;
  let lastDeg: number | null = null;
  let lastAt = 0;
  Location.watchHeadingAsync((h) => {
    const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
    const now = Date.now();
    const turned = lastDeg == null ? Infinity : Math.abs(((deg - lastDeg + 540) % 360) - 180);
    if (turned < HEADING_MIN_DEG || now - lastAt < HEADING_MS) return;
    lastDeg = deg;
    lastAt = now;
    const st = useHeadingStore.getState();
    useHeadingStore.setState({ heading: Math.round(deg), accuracy: st.accuracy === h.accuracy ? st.accuracy : h.accuracy });
  })
    .then((sub) => {
      // Released (or restarted) while this was starting: drop it.
      if (my !== headingGen || headingUsers === 0) sub.remove();
      else headingSub = sub;
    })
    .catch(() => {
      // No permission or no magnetometer (simulator): the map stays north-up.
    });
}

function acquireHeading() {
  if (headingRelease) {
    clearTimeout(headingRelease);
    headingRelease = null;
  }
  headingUsers += 1;
  if (headingUsers === 1 && !headingSub) startHeading();
}

function releaseHeading() {
  headingUsers = Math.max(0, headingUsers - 1);
  if (headingUsers > 0) return;
  // Grace period so map → Directions → map doesn't bounce the sensor.
  headingRelease = setTimeout(() => {
    headingRelease = null;
    if (headingUsers > 0) return;
    headingGen++;
    headingSub?.remove();
    headingSub = null;
  }, RELEASE_GRACE_MS);
}

// Coming back from the background: the OS may have paused the sensor — restart it.
AppState.addEventListener("change", (s) => {
  if (s !== "active" || headingUsers === 0) return;
  headingSub?.remove();
  headingSub = null;
  startHeading();
});

export function useHeading(enabled: boolean) {
  const heading = useHeadingStore((s) => s.heading);
  const accuracy = useHeadingStore((s) => s.accuracy);
  useEffect(() => {
    if (!enabled) return;
    acquireHeading();
    return releaseHeading;
  }, [enabled]);
  return { heading: enabled ? heading : null, accuracy: enabled ? accuracy : null };
}
