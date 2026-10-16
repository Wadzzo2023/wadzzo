import { DeviceMotion, type DeviceMotionMeasurement } from "expo-sensors";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Platform } from "react-native";

import { SWEEP_MIN_MS, SWEEP_SIDE_DEG } from "./constants";

/**
 * ── useMuralSweep ──────────────────────────────────────────────────────────
 *
 * The short scan after a lock (plan §3.2), on the phone's own gyroscope, in
 * this order: hold on the mural (middle photo), turn left (left photo), turn
 * right past the middle (right photo). Turn = the rotation rate projected
 * onto "up", integrated over time, so it means "how far you've turned on the
 * spot" however the phone is tilted.
 *
 * The server only checks the total span and the time; the photos keep their
 * left / middle / right slots whatever order they're taken in.
 *
 * The steps are a pure function (`advanceSweep`) fed one sensor sample at a
 * time; the hook only wires it to DeviceMotion.
 */

export type SweepStep = "centre" | "left" | "right" | "done";
export type SweepSlot = 0 | 1 | 2; // left, centre, right

/** Within this of where you started counts as still facing the mural. */
export const CENTRE_TOLERANCE_DEG = 6;
/** How long to hold steady on the mural before the middle photo. */
const HOLD_S = 0.4;
const TOO_FAST_DEG_PER_S = 70;
/** Turning back this far from the closest you got to the stop shows "other way". */
const WRONG_WAY_DEG = 5;
const UPDATE_MS = 16;
/** The server rejects a scan quicker than SWEEP_MIN_MS; the last photo waits for it (plus a margin). */
const MIN_SCAN_S = SWEEP_MIN_MS / 1000 + 0.3;

export type SweepView = {
  step: SweepStep;
  /** Degrees turned to the right since the lock (negative = left). */
  delta: number;
  tooFast: boolean;
  /** Moving away from the stop it's asking for. */
  wrongWay: boolean;
  /** 0–1 towards the current stop. */
  progress: number;
};
const START_VIEW: SweepView = { step: "centre", delta: 0, tooFast: false, wrongWay: false, progress: 0 };

export type SweepState = {
  turned: number;
  min: number;
  max: number;
  step: SweepStep;
  /** Seconds held steady on the mural (middle step). */
  steady: number;
  /** Seconds since the scan started. */
  elapsed: number;
  /** Closest point to the current stop since it started. */
  best: number;
};
export const START_STATE: SweepState = { turned: 0, min: 0, max: 0, step: "centre", steady: 0, elapsed: 0, best: 0 };

/**
 * One sensor sample: `rate` = degrees per second turning right, over `dt`
 * seconds. Returns the new state, what to show, and the photo slot to take
 * now, if any.
 */
export function advanceSweep(prev: SweepState, rate: number, dt: number): { state: SweepState; view: SweepView; capture: SweepSlot | null } {
  const s = { ...prev };
  s.turned += rate * dt;
  s.elapsed += dt;
  const d = s.turned;
  s.min = Math.min(s.min, d);
  s.max = Math.max(s.max, d);
  const tooFast = Math.abs(rate) > TOO_FAST_DEG_PER_S;

  let capture: SweepSlot | null = null;
  let progress = 1;
  let wrongWay = false;

  if (s.step === "centre") {
    // Middle first: hold still on the mural for a moment.
    s.steady = Math.abs(d) <= CENTRE_TOLERANCE_DEG && !tooFast ? s.steady + dt : 0;
    progress = Math.min(1, s.steady / HOLD_S);
    if (s.steady >= HOLD_S) {
      s.step = "left";
      s.best = d;
      capture = 1;
      progress = 0;
    }
  } else if (s.step === "left") {
    s.best = Math.min(s.best, d);
    wrongWay = d - s.best > WRONG_WAY_DEG;
    progress = Math.max(0, Math.min(1, -d / SWEEP_SIDE_DEG));
    if (d <= -SWEEP_SIDE_DEG) {
      s.step = "right";
      s.best = d;
      capture = 0;
      progress = 0;
      wrongWay = false;
    }
  } else if (s.step === "right") {
    s.best = Math.max(s.best, d);
    wrongWay = s.best - d > WRONG_WAY_DEG;
    // From the left stop, across the middle, to the right stop.
    progress = Math.max(0, Math.min(1, (d + SWEEP_SIDE_DEG) / (2 * SWEEP_SIDE_DEG)));
    // A very quick turn waits here a moment, so the scan isn't too short to count.
    if (d >= SWEEP_SIDE_DEG && s.elapsed >= MIN_SCAN_S) {
      s.step = "done";
      capture = 2;
      progress = 1;
      wrongWay = false;
    }
  }

  return { state: s, view: { step: s.step, delta: d, tooFast, wrongWay, progress }, capture };
}

/**
 * Rotation rate (deg/s) about the device's x, y, z axes. expo-sensors names
 * them differently per platform (read from its native code): iOS sends
 * alpha = z, beta = y, gamma = x; Android sends the gyroscope's values in
 * order, alpha = x, beta = y, gamma = z. Both are right-handed about the same
 * device axes (x right, y up the screen, z out of the screen).
 */
function rateXYZ(rr: NonNullable<DeviceMotionMeasurement["rotationRate"]>): [number, number, number] {
  return Platform.OS === "android" ? [rr.alpha, rr.beta, rr.gamma] : [rr.gamma, rr.beta, rr.alpha];
}

/**
 * Degrees per second turning to the RIGHT. `accelerationIncludingGravity`
 * points down on both platforms (expo flips Android's to match iOS), so "up"
 * is its negative. Turning left is a positive rotation about up
 * (right-handed), so turning right is the rate projected onto down.
 */
export function rightTurnRate(rate: [number, number, number], down: { x: number; y: number; z: number }) {
  const n = Math.hypot(down.x, down.y, down.z) || 1;
  return (rate[0] * down.x + rate[1] * down.y + rate[2] * down.z) / n;
}

export function useMuralSweep({ active, onCapture }: { active: boolean; onCapture: (slot: SweepSlot) => void }) {
  const [view, setView] = useState<SweepView>(START_VIEW);
  const state = useRef<SweepState>(START_STATE);
  const startedAt = useRef(0);
  const lastT = useRef<number | null>(null);
  const capture = useEffectEvent(onCapture);

  useEffect(() => {
    if (!active) return;
    state.current = START_STATE;
    lastT.current = null;
    startedAt.current = Date.now();

    DeviceMotion.setUpdateInterval(UPDATE_MS);
    const sub = DeviceMotion.addListener((m) => {
      const rr = m.rotationRate;
      const g = m.accelerationIncludingGravity;
      if (!rr || !g) return;
      const now = Date.now();
      const dt = lastT.current == null ? 0 : (now - lastT.current) / 1000;
      lastT.current = now;
      if (dt <= 0 || dt > 0.25) return;

      const next = advanceSweep(state.current, rightTurnRate(rateXYZ(rr), g), dt);
      state.current = next.state;
      if (next.capture != null) capture(next.capture);
      setView(next.view);
    });
    return () => sub.remove();
  }, [active]);

  return {
    // Until the first sensor event of a new activation, show the start.
    ...(active ? view : START_VIEW),
    /** What the server checks (plan §3.2). */
    result: () => ({
      spanDeg: Math.round(state.current.max - state.current.min),
      durationMs: Date.now() - startedAt.current,
    }),
  };
}
