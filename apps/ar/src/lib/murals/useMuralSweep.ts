import { useCallback, useEffect, useRef, useState } from "react";

import { angleDelta } from "~/lib/ar/heading";

import { SWEEP_MIN_MS, SWEEP_SIDE_DEG } from "@wadzzo/ar-core/murals/constants";

/**
 * ── useMuralSweep ──────────────────────────────────────────────────────────
 *
 * The short scan after a lock (plan §3.2), in this order: hold on the mural
 * (middle photo), turn left (left photo), turn right past the middle (right
 * photo). Driven by the camera heading from `useDeviceHeading` (gyro-fused,
 * so it's smooth and 1:1 with real rotation); on a laptop that heading comes
 * from dragging, so the whole flow is testable without a phone.
 *
 * The photos keep their slots on the wire — left, centre, right — whatever
 * order they're taken in; the centre one is the cover candidate and the one
 * Cloud Vision labels. The server only checks the total span and the time.
 *
 * The steps are a pure function (`advanceSweep`, same rules as the mobile
 * app); the hook samples the heading on a steady clock so holding still
 * still counts as time passing.
 */

export type SweepStep = "centre" | "left" | "right" | "done";
export type SweepSlot = 0 | 1 | 2; // left, centre, right

/** Within this of the lock heading counts as still facing the mural. */
export const CENTRE_TOLERANCE_DEG = 6;
/** How long to hold steady on the mural before the middle photo. */
const HOLD_S = 0.4;
/** Faster than this and the keyframe would blur — ask them to slow down. */
const TOO_FAST_DEG_PER_S = 70;
/** Turning back this far from the closest you got to the stop shows "other way". */
const WRONG_WAY_DEG = 5;
/** The server rejects a scan quicker than SWEEP_MIN_MS; the last photo waits for it (plus a margin). */
const MIN_SCAN_S = SWEEP_MIN_MS / 1000 + 0.3;
const SAMPLE_MS = 33;

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
const START_VIEW: SweepView = {
  step: "centre",
  delta: 0,
  tooFast: false,
  wrongWay: false,
  progress: 0,
};

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
export const START_STATE: SweepState = {
  turned: 0,
  min: 0,
  max: 0,
  step: "centre",
  steady: 0,
  elapsed: 0,
  best: 0,
};

/**
 * One sample: `turned` = degrees to the right of the lock heading now, `dt`
 * seconds since the last sample. Returns the new state, what to show, and the
 * photo slot to take now, if any.
 */
export function advanceSweep(
  prev: SweepState,
  turned: number,
  dt: number,
): { state: SweepState; view: SweepView; capture: SweepSlot | null } {
  const s = { ...prev };
  const rate = dt > 0 ? (turned - prev.turned) / dt : 0;
  s.turned = turned;
  s.elapsed += dt;
  const d = turned;
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

export function useMuralSweep({
  heading,
  active,
  onCapture,
}: {
  heading: number;
  active: boolean;
  onCapture: (slot: SweepSlot) => void;
}) {
  const [view, setView] = useState<SweepView>(START_VIEW);
  const headingRef = useRef(heading);
  headingRef.current = heading;
  const captureRef = useRef(onCapture);
  captureRef.current = onCapture;
  const state = useRef<SweepState>(START_STATE);
  const startedAt = useRef(0);

  const reset = useCallback(() => {
    state.current = START_STATE;
    setView(START_VIEW);
  }, []);

  useEffect(() => {
    if (!active) {
      reset();
      return;
    }
    const origin = headingRef.current;
    state.current = START_STATE;
    startedAt.current = performance.now();
    let last = startedAt.current;
    const id = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (dt <= 0 || dt > 0.5) return;
      const next = advanceSweep(state.current, angleDelta(origin, headingRef.current), dt);
      state.current = next.state;
      if (next.capture != null) captureRef.current(next.capture);
      setView(next.view);
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, [active, reset]);

  return {
    ...(active ? view : START_VIEW),
    reset,
    /** What the server checks (plan §3.2). */
    result: () => ({
      spanDeg: Math.round(state.current.max - state.current.min),
      durationMs: Math.round(performance.now() - startedAt.current),
    }),
  };
}
