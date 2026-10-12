import { useCallback, useEffect, useRef, useState } from "react";

import {
  absoluteAlpha,
  angleDelta,
  circularMean,
  elevationFromEuler,
  headingFromEuler,
  normalize360,
  smoothHeading,
} from "./heading";

/**
 * How gently the raw sensor reading is chased, per rendered frame.
 *
 * Higher than it used to be (0.1), and deliberately so. That value was fighting
 * magnetometer noise — a signal that genuinely jitters several degrees with the
 * phone held still, and had to be filtered hard enough to hide it. The live
 * path no longer reads the magnetometer at all (see the anchor note below), and
 * the gyro-fused stream that replaced it is clean enough that heavy smoothing
 * only adds lag. What's left here is mild MEMS noise.
 */
const HEADING_SMOOTH = 0.25;
const ELEVATION_SMOOTH = 0.25;

/**
 * Below this many degrees of change, treat it as sensor noise rather than
 * real motion and skip the state update entirely. Without it, a phone lying
 * perfectly still still produces a fresh (if tiny) `setState` every frame —
 * MEMS gyro noise never reads exactly zero — and each of those is a full
 * scene re-render for movement nobody can actually see.
 */
const DEADBAND_DEG = 0.12;

/**
 * Maximum degrees a raw heading may jump between two consecutive samples
 * before it's treated as a glitch rather than real motion.
 *
 * Rarely fires now that the magnetometer is out of the live path, but it isn't
 * redundant: `headingFromEuler` switches to its top-edge fallback when the
 * camera tips near-vertical, and that changeover is a genuine discontinuity in
 * the projection itself, independent of which sensor fed it. The streak cap
 * below keeps a real fast turn — or waking up after the tab was backgrounded —
 * from getting stuck rejecting its own new, correct position forever.
 */
const MAX_PLAUSIBLE_JUMP_DEG = 60;

/**
 * How long the one-shot compass anchor stays open, and how many samples close
 * it early. ~1.5s is enough for a magnetometer to produce a dozen readings
 * without making entry feel like it stalls; twelve samples averaged is well
 * past the point where more stops improving the estimate.
 */
const ANCHOR_WINDOW_MS = 1_500;
const ANCHOR_MAX_SAMPLES = 12;

/** Android's absolute (magnetometer-fused) event — read only while anchoring. */
const ABSOLUTE_EVENT = "deviceorientationabsolute";
/** The relative, gyro-fused event the live path runs on, on every platform. */
const RELATIVE_EVENT = "deviceorientation";

/**
 * ── useDeviceHeading ───────────────────────────────────────────────────────
 *
 * Which way the rear camera is pointing, in degrees clockwise from true north
 * — the one number the whole AR overlay is built on.
 *
 * ## Why the compass is only read once
 *
 * The obvious implementation subscribes to the absolute, north-referenced
 * orientation stream and uses it directly. That is what this hook used to do,
 * and it does not work in practice: a phone magnetometer is noisy by nature,
 * drifts with nearby metal and current, and periodically emits readings that
 * are simply wrong. Fed straight into the scene, that produces exactly the
 * symptoms this app had — pins that shake while the phone sits still, a view
 * that lurches the wrong way before correcting itself, and a heading so
 * twitchy that no amount of smoothing separates a real turn from noise
 * without also making real turns lag.
 *
 * Smoothing cannot fix this, because the problem isn't the filter's cutoff —
 * it's that the signal being filtered is unreliable in the first place.
 *
 * So the magnetometer is used for exactly one thing: establishing, once, which
 * way north is. Everything after that runs on the **relative** orientation
 * stream — `deviceorientation`, which browsers fuse from the gyroscope and
 * accelerometer with no magnetometer involved. That signal is smooth, responds
 * 1:1 to real rotation, and has no absolute reference at all, which is
 * precisely why it needs the anchor:
 *
 *     heading = relativeHeading + anchorOffset
 *
 * `anchorOffset` is computed during a short window at startup by comparing
 * true-north readings against concurrent relative ones and taking their
 * circular mean, then frozen. The magnetometer is unsubscribed and never
 * consulted again.
 *
 * The trade-off is honest: gyro yaw drifts, typically a few degrees per
 * minute. `recenter()` re-runs the anchor when that matters. Drift accumulating
 * slowly and predictably is a far better failure mode than a heading that
 * jumps unpredictably, because only one of the two is stable enough to place
 * an object in the world and have it stay there.
 *
 * ## Degradation
 *
 * The anchor is best-effort and never blocks. A device with no usable compass
 * — no magnetometer, an uncalibrated one (iOS reports `-1`), or a browser that
 * fires no absolute event — still tracks motion perfectly; the scene simply
 * starts from an arbitrary north. Motion is what the experience needs;
 * the compass only decides where the numbers start from.
 *
 * ## Platform notes
 *
 *  1. iOS carries `webkitCompassHeading` on its ordinary `deviceorientation`
 *     events, so the anchor and the live signal arrive on the same stream.
 *     Android splits them: `deviceorientation` is relative, and the absolute
 *     one is a separate event, subscribed only for the anchor window.
 *
 *  2. iOS 13+ refuses orientation events outright until
 *     `DeviceOrientationEvent.requestPermission()` resolves — and only honours
 *     that call inside a user gesture. Hence `request()`, which the permission
 *     gate calls from an actual tap.
 *
 *  3. Elevation needs no anchor. It comes from `beta`/`gamma`, which are
 *     referenced to gravity rather than to north, so it is absolute already.
 *
 * Where there's no sensor at all — every desktop browser — `dragBy()` lets the
 * scene be panned by hand, which is also how this gets reviewed on a laptop.
 */

type OrientationEventWithWebkit = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

type DeviceOrientationEventStatic = {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export type HeadingSource = "sensor" | "manual";

/**
 * `unsupported` is deliberately distinct from `denied`. Desktop browsers have
 * no orientation sensor at all, and telling someone to re-enable a permission
 * in their site settings — where no such entry exists — is worse than saying
 * nothing.
 *
 * `insecure` is distinct from both. Every browser refuses orientation events
 * outside a secure context (HTTPS, or `localhost`) — a phone hitting the dev
 * machine's plain-HTTP LAN address gets no error, no prompt, just silence.
 * Left folded into `granted`, as it was before, that reads as "compass is on"
 * while nothing ever arrives — indistinguishable from a genuine bug. It has a
 * real, actionable fix (use the HTTPS URL), unlike `unsupported`'s "this
 * device can't do it", so it needs its own copy.
 */
export type HeadingPermission =
  | "pending"
  | "granted"
  | "denied"
  | "unsupported"
  | "insecure";

/**
 * Raw ground truth for the temporary on-screen debug readout — see
 * `DebugHeadingOverlay` in `ar.tsx`. Not used by the scene itself; only
 * exists so a real-device report can be turned into actual numbers instead
 * of a description someone else has to reverse-engineer. Delete this and its
 * one call site once the heading is confirmed working end to end.
 */
export interface HeadingDebug {
  eventName: string;
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  webkitCompassHeading: number | null;
  /** Bumped on every qualifying sensor event — proves events are arriving. */
  sampleCount: number;
  /** Bumped whenever a raw sample is thrown out as an implausible jump. */
  rejectedCount: number;
  /** Frozen north reference, degrees, or null while unanchored. */
  anchorOffset: number | null;
  /** How many compass samples the anchor was averaged from. */
  anchorSamples: number;
  /** False while the anchor window is still open. */
  anchorClosed: boolean;
}

export function useDeviceHeading() {
  const [heading, setHeading] = useState(0);
  /** Degrees above the horizon the camera is aimed. Drives vertical placement. */
  const [elevation, setElevation] = useState(0);
  const [source, setSource] = useState<HeadingSource>("manual");
  const [permission, setPermission] = useState<HeadingPermission>("pending");
  const [debug, setDebug] = useState<HeadingDebug | null>(null);
  /** True once a real north reference has been established and frozen. */
  const [anchored, setAnchored] = useState(false);

  const smoothed = useRef(0);
  const smoothedElevation = useRef(0);
  const listening = useRef(false);

  // The raw values from whichever event fired most recently, and whether a
  // sample worth acting on has arrived since the last animation frame.
  // Sensor callbacks and React renders are decoupled through this: the
  // listeners never call `setState` directly, `tick` does, once per frame.
  // `heading` here is the *relative* reading — the anchor is applied in
  // `tick`, so a late-arriving anchor retroactively corrects the live value
  // rather than needing every stored sample rewritten.
  const pending = useRef<{ heading: number | null; elevation: number | null }>({
    heading: null,
    elevation: null,
  });
  const rafId = useRef<number | null>(null);
  const pendingDebug = useRef<HeadingDebug | null>(null);

  // Ground truth for outlier rejection below — the last raw heading this hook
  // actually accepted, independent of (ahead of) the smoothed/rendered one.
  const lastAcceptedRaw = useRef<number | null>(null);
  const consecutiveRejections = useRef(0);
  /** Lifetime count, purely for the debug readout — never reset. */
  const totalRejectedCount = useRef(0);

  // ── One-shot compass anchor ──────────────────────────────────────────────
  /** Frozen degrees to add to every relative reading. Null until anchored. */
  const anchorOffset = useRef<number | null>(null);
  /** Offsets collected during the open window, averaged on close. */
  const anchorSamples = useRef<number[]>([]);
  /** Latched once the window closes — no further compass reads, ever. */
  const anchorClosed = useRef(false);
  const anchorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The offset `tick` has already folded into `smoothed`, to spot changes. */
  const appliedOffset = useRef<number | null>(null);
  /** Most recent relative heading, for pairing with Android's absolute event. */
  const latestRelative = useRef<number | null>(null);

  /**
   * Close the anchor window: average what was collected, freeze it, and drop
   * the magnetometer subscription for good. Safe to call repeatedly.
   */
  const closeAnchor = useCallback(() => {
    if (anchorClosed.current) return;
    anchorClosed.current = true;

    if (anchorTimer.current != null) {
      clearTimeout(anchorTimer.current);
      anchorTimer.current = null;
    }
    window.removeEventListener(ABSOLUTE_EVENT, handleAbsoluteRef.current, true);

    // The mean is a refinement, not a replacement — `anchorOffset` already
    // holds the first sample so the scene wasn't left unanchored while the
    // window was open. Only overwrite it if the average is actually usable.
    const mean = circularMean(anchorSamples.current);
    if (mean != null) anchorOffset.current = mean;

    setAnchored(anchorOffset.current != null);
  }, []);

  /**
   * Fold one true-north reading into the anchor estimate.
   *
   * Takes the compass sample's own orientation triple rather than a bare
   * heading, so the same projection (`headingFromEuler`) runs on both sides of
   * the comparison — anything else would bake this module's held-upright /
   * gimbal corrections into one side of the subtraction but not the other.
   */
  const collectAnchor = useCallback(
    (
      alpha: number | null,
      beta: number | null,
      gamma: number | null,
      webkitCompassHeading: number | null | undefined,
      relative: number | null,
    ) => {
      if (anchorClosed.current || relative == null) return;

      const trueHeading = headingFromEuler(
        absoluteAlpha(alpha, webkitCompassHeading),
        beta,
        gamma,
      );
      // Null covers both a degenerate pose and — via `absoluteAlpha` — iOS's
      // documented `-1` uncalibrated-compass sentinel. Either way there's no
      // north here to learn from.
      if (trueHeading == null) return;

      const offset = normalize360(trueHeading - relative);
      anchorSamples.current.push(offset);

      // Apply the very first sample immediately rather than waiting out the
      // window. A rough anchor now beats a better one a second and a half from
      // now: without it the scene spends its most-watched moment — the instant
      // it opens — pointing somewhere arbitrary, and then visibly swings.
      anchorOffset.current ??= offset;

      if (anchorSamples.current.length >= ANCHOR_MAX_SAMPLES) closeAnchor();
    },
    [closeAnchor],
  );

  /** Android's absolute stream. Only subscribed while the window is open. */
  const handleAbsolute = useCallback(
    (e: Event) => {
      if (anchorClosed.current) return;
      const ev = e as DeviceOrientationEvent;
      collectAnchor(
        ev.alpha,
        ev.beta,
        ev.gamma,
        undefined,
        latestRelative.current,
      );
    },
    [collectAnchor],
  );

  // `closeAnchor` has to remove the same listener identity it added, but is
  // defined above `handleAbsolute` (it's a dependency of it, via
  // `collectAnchor`). A ref breaks that cycle without making either callback
  // depend on the other's identity.
  const handleAbsoluteRef = useRef<(e: Event) => void>(() => undefined);
  handleAbsoluteRef.current = handleAbsolute;

  const handle = useCallback(
    (e: Event) => {
      const ev = e as OrientationEventWithWebkit;

      // Note `ev.alpha` is used as-is: this is the *relative* stream, so its
      // alpha is referenced to an arbitrary origin, and that's exactly what's
      // wanted. Converting it toward north here (as this hook used to, via
      // `absoluteAlpha`) is what put the magnetometer back in the live path.
      //
      // Reading alpha directly as a heading would still be wrong for a
      // different reason — it describes where the phone's *top edge* points,
      // which aims at the sky when the phone is held up for AR, and sits on a
      // gimbal singularity there. `headingFromEuler` projects the rear
      // camera's own axis instead. See lib/ar/heading.ts.
      const raw = headingFromEuler(ev.alpha, ev.beta, ev.gamma);
      const rawElevation = elevationFromEuler(ev.beta, ev.gamma);

      if (raw != null) latestRelative.current = raw;

      // Outlier rejection — see MAX_PLAUSIBLE_JUMP_DEG. Runs on the relative
      // reading, before the anchor is applied, so a change to the anchor can
      // never be mistaken for a physical jump.
      if (raw != null) {
        const prev = lastAcceptedRaw.current;
        const isOutlier =
          prev != null &&
          Math.abs(angleDelta(prev, raw)) > MAX_PLAUSIBLE_JUMP_DEG &&
          consecutiveRejections.current < 3;

        if (isOutlier) {
          consecutiveRejections.current += 1;
          totalRejectedCount.current += 1;
        } else {
          consecutiveRejections.current = 0;
          lastAcceptedRaw.current = raw;
          // Overwrite, don't queue — only the freshest sample by the next
          // frame matters, and averaging stale ones back in would just
          // reintroduce the lag the smoothing is already there to control.
          pending.current.heading = raw;
        }
      }

      if (rawElevation != null) pending.current.elevation = rawElevation;

      // iOS ships the compass on this same event, so the anchor feeds itself
      // here with no second subscription. Stops the moment the window closes.
      if (!anchorClosed.current && ev.webkitCompassHeading != null) {
        collectAnchor(ev.alpha, ev.beta, ev.gamma, ev.webkitCompassHeading, raw);
      }

      pendingDebug.current = {
        eventName: RELATIVE_EVENT,
        alpha: ev.alpha,
        beta: ev.beta,
        gamma: ev.gamma,
        webkitCompassHeading: ev.webkitCompassHeading ?? null,
        sampleCount: (pendingDebug.current?.sampleCount ?? 0) + 1,
        rejectedCount: totalRejectedCount.current,
        anchorOffset: anchorOffset.current,
        anchorSamples: anchorSamples.current.length,
        anchorClosed: anchorClosed.current,
      };
    },
    [collectAnchor],
  );

  /**
   * Runs at most once per display frame regardless of how many sensor events
   * arrived in between — some devices fire `deviceorientation` well above
   * 60 Hz, and applying the low-pass filter once per raw event rather than
   * once per rendered frame made its effective time constant track the
   * sensor's rate instead of the screen's, which is what made the pins never
   * fully settle. One state update per frame is also the fastest a human eye
   * can actually resolve as motion rather than jitter.
   */
  const tick = useCallback(() => {
    const { heading: rawHeading, elevation: rawElevation } = pending.current;

    if (rawHeading != null) {
      const offset = anchorOffset.current ?? 0;
      const target = normalize360(rawHeading + offset);

      if (appliedOffset.current == null && anchorOffset.current != null) {
        // The anchor just landed. Snap rather than ease into it: this is a
        // correction to the frame of reference, not motion of the device, and
        // sweeping the entire scene into place over half a second would read
        // as the world rotating around a viewer who hasn't moved.
        appliedOffset.current = anchorOffset.current;
        smoothed.current = target;
        setSource("sensor");
        setHeading(target);
      } else {
        // Later anchor changes (the window's averaged refinement, or an
        // explicit recenter) are deliberately *not* snapped — they're small,
        // and easing absorbs them invisibly.
        appliedOffset.current = anchorOffset.current;

        const next = smoothHeading(smoothed.current, target, HEADING_SMOOTH);
        const moved = Math.abs(angleDelta(smoothed.current, next)) > DEADBAND_DEG;
        smoothed.current = next;
        // Still integrate every frame even below the deadband — skipping the
        // update entirely would let error accumulate and eventually jump, the
        // exact stutter this is meant to remove. Only the render is skipped.
        if (moved) {
          setSource("sensor");
          setHeading(smoothed.current);
        }
      }
    }

    if (rawElevation != null) {
      const next =
        smoothedElevation.current +
        (rawElevation - smoothedElevation.current) * ELEVATION_SMOOTH;
      const moved = Math.abs(next - smoothedElevation.current) > DEADBAND_DEG;
      smoothedElevation.current = next;
      if (moved) setElevation(smoothedElevation.current);
    }

    pending.current.heading = null;
    pending.current.elevation = null;

    // Debug snapshot updates every tick unconditionally, deadband or not —
    // it exists specifically to show whether samples are arriving at all,
    // which the deadband would otherwise hide.
    if (pendingDebug.current) setDebug(pendingDebug.current);

    if (listening.current) rafId.current = requestAnimationFrame(tick);
  }, []);

  /** Open (or reopen) the compass anchor window. */
  const openAnchor = useCallback(() => {
    anchorClosed.current = false;
    anchorSamples.current = [];

    // iOS needs no subscription here — `webkitCompassHeading` rides along on
    // the relative events `handle` already receives. Android has no such
    // field and needs its separate absolute event, for this window only.
    if (`on${ABSOLUTE_EVENT}` in window) {
      window.addEventListener(ABSOLUTE_EVENT, handleAbsoluteRef.current, true);
    }

    if (anchorTimer.current != null) clearTimeout(anchorTimer.current);
    anchorTimer.current = setTimeout(closeAnchor, ANCHOR_WINDOW_MS);
  }, [closeAnchor]);

  const attach = useCallback(() => {
    if (listening.current) return;
    listening.current = true;
    rafId.current = requestAnimationFrame(tick);

    // One stream, always the relative one, on every platform. An earlier
    // version picked between this and the absolute event by feature detection
    // and fed whichever it found straight to the scene — which meant the
    // magnetometer drove the view on any device that had one. The absolute
    // event is still used, but only by `openAnchor`, and only briefly.
    window.addEventListener(RELATIVE_EVENT, handle, true);
    openAnchor();
  }, [handle, tick, openAnchor]);

  /** Must be called from a user gesture — iOS silently denies otherwise. */
  const request = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      setPermission("unsupported");
      return false;
    }

    if (!window.isSecureContext) {
      setPermission("insecure");
      return false;
    }

    const Ctor = window.DeviceOrientationEvent as unknown as
      DeviceOrientationEventStatic;

    if (typeof Ctor.requestPermission === "function") {
      try {
        const res = await Ctor.requestPermission();
        const ok = res === "granted";
        setPermission(ok ? "granted" : "denied");
        if (ok) attach();
        return ok;
      } catch {
        setPermission("denied");
        return false;
      }
    }

    // Android and desktop: no permission call, just listen. Whether a sensor
    // actually exists only becomes clear when an event arrives (or doesn't),
    // so provisionally grant and let `source` reveal the truth — it stays
    // "manual" until a real reading lands.
    setPermission("granted");
    attach();
    return true;
  }, [attach]);

  /**
   * Re-derive north from the compass. The escape hatch for accumulated gyro
   * drift, and for an initial anchor taken while the phone happened to be
   * near something magnetic.
   *
   * Deliberately manual. Re-anchoring on a timer would reintroduce, at
   * intervals, exactly the unpredictable heading jumps this design exists to
   * remove — and would do it without the user having asked for a correction or
   * having any idea why the world just moved.
   */
  const recenter = useCallback(() => {
    if (!listening.current) return;
    anchorOffset.current = null;
    appliedOffset.current = null;
    setAnchored(false);
    openAnchor();
  }, [openAnchor]);

  useEffect(
    () => () => {
      window.removeEventListener(RELATIVE_EVENT, handle, true);
      window.removeEventListener(ABSOLUTE_EVENT, handleAbsoluteRef.current, true);
      listening.current = false;
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
      if (anchorTimer.current != null) clearTimeout(anchorTimer.current);
    },
    [handle],
  );

  /**
   * Manual look-around for anything without a compass. Pans and tilts, so the
   * pitch behaviour can be exercised on a laptop too — otherwise vertical
   * placement would be unreviewable outside a phone.
   *
   * Elevation clamps at ±80°: past that the camera axis is near-vertical, its
   * azimuth stops meaning anything, and there is nothing to look at anyway.
   */
  const dragBy = useCallback((azimuthDeg: number, elevationDeg = 0) => {
    setSource("manual");
    smoothed.current = (smoothed.current + azimuthDeg + 360) % 360;
    setHeading(smoothed.current);

    if (elevationDeg !== 0) {
      smoothedElevation.current = Math.max(
        -80,
        Math.min(80, smoothedElevation.current + elevationDeg),
      );
      setElevation(smoothedElevation.current);
    }
  }, []);

  return {
    heading,
    elevation,
    source,
    permission,
    request,
    dragBy,
    debug,
    /** A real north reference has been established and frozen. */
    anchored,
    recenter,
  };
}
