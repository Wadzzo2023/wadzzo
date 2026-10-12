import { useCallback, useEffect, useRef, useState } from "react";

import type { Coords, GeoFix } from "@wadzzo/ar-core/ar/types";
import { platformBranding } from "@wadzzo/platform/branding";

export type GeoStatus = "idle" | "prompting" | "tracking" | "denied" | "unavailable";

/**
 * Why there's no fix. Kept separate from `status` because the two failures
 * need completely different things from the user — one is a browser
 * permission they can re-grant, the other is an OS setting or a device that
 * simply can't see the sky.
 */
export type GeoReason = "denied" | "unavailable" | "timeout";

export const GEO_REASON_TEXT: Record<GeoReason, string> = {
  denied: `Location is blocked for this site. Allow it and ${platformBranding.name} can show the drops around you.`,
  unavailable: "Your device couldn't get a location fix. Check that Location Services are on.",
  timeout:
    "Location is taking a long time to arrive. Move somewhere with a clearer view of the sky and try again.",
};

/**
 * ── useGeolocation ─────────────────────────────────────────────────────────
 *
 * A continuous fix, not a one-shot. The map puck has to keep up with someone
 * walking, cycling, or driving past a drop, so this holds a `watchPosition`
 * for its whole lifetime rather than polling.
 *
 * Two things the raw API gets wrong for this use case, both handled here:
 *
 *  1. `heading` is null whenever you're stationary, and null again the moment
 *     you stop — which makes a puck's arrow snap to north every time someone
 *     pauses at a crossing. We keep the last good heading instead, and only
 *     trust a fresh one above a walking-pace threshold.
 *
 *  2. Low-accuracy fixes arrive interleaved with good ones on most Android
 *     handsets, so a puck that accepts every update visibly teleports. We
 *     reject a fix that's much worse than the one we already hold unless the
 *     current one has gone stale.
 *
 * There is deliberately **no simulated fallback**. This app is about being in
 * a real place: every pin is somewhere, capture is range-gated, and the AR
 * scene places drops by bearing. A pretend walk around a fixed point produced
 * a map that looked alive while being entirely fictional — worse than an
 * honest prompt, because it hides the one thing the user needs to fix.
 */
export function useGeolocation({ enabled = true }: { enabled?: boolean } = {}) {
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [reason, setReason] = useState<GeoReason | null>(null);
  const lastHeading = useRef<number | null>(null);
  const watchId = useRef<number | null>(null);
  /** Bumped by `retry()` to re-run the watch effect. */
  const [attempt, setAttempt] = useState(0);

  /**
   * Ask again. On most browsers a denial is sticky and this will fail without
   * re-prompting — which is why the UI pairs it with per-platform
   * instructions rather than relying on the button alone. Still worth having:
   * it does re-prompt on a fresh "unavailable", and after the user changes the
   * setting it's what picks the fix up without a reload.
   */
  const retry = useCallback(() => {
    setReason(null);
    setStatus("prompting");
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // The `prefer-optional-chain` rule suggests `navigator?.x` here, which does
    // NOT work: optional chaining guards null/undefined *values*, not undeclared
    // identifiers. `navigator` is genuinely absent as a global during Next.js
    // SSR, where `navigator?.x` still throws a ReferenceError. The `typeof`
    // check is the only safe form, so the rule is suppressed rather than obeyed.

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      setReason("unavailable");
      return;
    }

    setStatus("prompting");

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus("tracking");
        setReason(null);

        const { latitude, longitude, accuracy, heading, speed } = pos.coords;

        // Hold the last confident heading through stops and slow crawls.
        if (heading != null && !Number.isNaN(heading) && (speed ?? 0) > 0.6) {
          lastHeading.current = heading;
        }

        setFix((prev) => {
          const stale = prev ? pos.timestamp - prev.timestamp > 8_000 : true;
          const muchWorse = prev ? accuracy > prev.accuracy * 2.5 : false;
          if (prev && muchWorse && !stale) return prev;

          return {
            lat: latitude,
            lng: longitude,
            accuracy,
            heading: lastHeading.current,
            speed: speed ?? null,
            timestamp: pos.timestamp,
          };
        });
      },
      (err) => {
        const why: GeoReason =
          err.code === err.PERMISSION_DENIED
            ? "denied"
            : err.code === err.TIMEOUT
              ? "timeout"
              : "unavailable";
        setReason(why);
        // A timeout isn't a refusal — the watch stays live and may still
        // deliver, so don't claim the device is unavailable.
        setStatus(why === "denied" ? "denied" : "unavailable");
      },
      {
        enableHighAccuracy: true,
        // Accept a fix up to 5s old on the first read so the map can paint
        // immediately instead of waiting on a cold GPS lock.
        maximumAge: 5_000,
        timeout: 12_000,
      },
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [enabled, attempt]);

  return {
    fix,
    /** Null until there's a real fix — callers must handle its absence. */
    center: fix ? { lat: fix.lat, lng: fix.lng } : null,
    status,
    reason,
    retry,
    isLive: status === "tracking",
  };
}
