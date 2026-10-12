import { useCallback, useEffect, useRef, useState } from "react";

import { angleDelta } from "~/lib/ar/heading";

import { SWEEP_SIDE_DEG } from "@wadzzo/ar-core/murals/constants";

/**
 * ── useMuralSweep ──────────────────────────────────────────────────────────
 *
 * The left → right → centre turn after a lock (plan §3.2). Driven by the
 * camera heading from `useDeviceHeading` (gyro-fused, so it's smooth and
 * 1:1 with real rotation); on a laptop that heading comes from dragging, so
 * the whole flow is testable without a phone.
 *
 * A keyframe is taken at each of the three stops via `onCapture`. Order on
 * the wire is always left, centre, right — the centre one is the cover
 * candidate and the one Cloud Vision labels.
 */

export type SweepStep = "left" | "right" | "centre" | "done";
export type SweepSlot = 0 | 1 | 2; // left, centre, right

/** Within this of the lock heading counts as "back to centre". */
const CENTRE_TOLERANCE_DEG = 4;
/** Faster than this and the keyframe would blur — ask them to slow down. */
const TOO_FAST_DEG_PER_S = 70;

export function useMuralSweep({
  heading,
  active,
  onCapture,
}: {
  heading: number;
  active: boolean;
  onCapture: (slot: SweepSlot) => void;
}) {
  const [step, setStep] = useState<SweepStep>("left");
  /** Signed degrees from the lock heading; negative = turned left. */
  const [delta, setDelta] = useState(0);
  const [tooFast, setTooFast] = useState(false);

  const origin = useRef<number | null>(null);
  const startedAt = useRef(0);
  const span = useRef({ min: 0, max: 0 });
  const last = useRef<{ h: number; t: number } | null>(null);
  const stepRef = useRef<SweepStep>("left");
  const captureRef = useRef(onCapture);
  captureRef.current = onCapture;

  const reset = useCallback(() => {
    origin.current = null;
    span.current = { min: 0, max: 0 };
    last.current = null;
    stepRef.current = "left";
    setStep("left");
    setDelta(0);
    setTooFast(false);
  }, []);

  useEffect(() => {
    if (!active) {
      reset();
      return;
    }
    const now = performance.now();
    if (origin.current == null) {
      origin.current = heading;
      startedAt.current = now;
    }
    const d = angleDelta(origin.current, heading);
    setDelta(d);
    span.current = {
      min: Math.min(span.current.min, d),
      max: Math.max(span.current.max, d),
    };

    if (last.current) {
      const dt = (now - last.current.t) / 1000;
      if (dt > 0.05) {
        const rate = Math.abs(angleDelta(last.current.h, heading)) / dt;
        setTooFast(rate > TOO_FAST_DEG_PER_S);
        last.current = { h: heading, t: now };
      }
    } else {
      last.current = { h: heading, t: now };
    }

    const advance = (next: SweepStep, slot: SweepSlot) => {
      stepRef.current = next;
      setStep(next);
      captureRef.current(slot);
    };
    if (stepRef.current === "left" && d <= -SWEEP_SIDE_DEG) advance("right", 0);
    else if (stepRef.current === "right" && d >= SWEEP_SIDE_DEG) advance("centre", 2);
    else if (stepRef.current === "centre" && Math.abs(d) <= CENTRE_TOLERANCE_DEG)
      advance("done", 1);
  }, [active, heading, reset]);

  return {
    step,
    delta,
    tooFast,
    reset,
    /** What the server checks (plan §3.2). */
    result: () => ({
      spanDeg: Math.round(span.current.max - span.current.min),
      durationMs: Math.round(performance.now() - startedAt.current),
    }),
  };
}
