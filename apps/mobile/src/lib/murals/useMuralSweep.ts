import { DeviceMotion } from "expo-sensors";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { SWEEP_SIDE_DEG } from "./constants";

/**
 * ── useMuralSweep ──────────────────────────────────────────────────────────
 *
 * The left → right → centre turn after a lock (plan §3.2), on the phone's
 * own gyroscope. Turn = the rotation rate projected onto gravity ("up"),
 * integrated over time, so it means "how far you've turned on the spot"
 * however the phone is tilted.
 *
 * Gyro sign conventions differ between platforms and sensor frames, so the
 * hook never assumes which sign is left: the first side the person turns to
 * past the threshold *is* "left" (that's what the screen asked for), and the
 * second stop must be on the other side. Nobody can get stuck because a
 * platform reports the opposite sign.
 *
 * Each activation starts fresh: the refs reset when it starts, and every
 * state update comes from a sensor event.
 */

export type SweepStep = "left" | "right" | "centre" | "done";
export type SweepSlot = 0 | 1 | 2; // left, centre, right

const CENTRE_TOLERANCE_DEG = 4;
const TOO_FAST_DEG_PER_S = 70;
const UPDATE_MS = 16;

type View = { step: SweepStep; delta: number; tooFast: boolean };
const START: View = { step: "left", delta: 0, tooFast: false };

export function useMuralSweep({ active, onCapture }: { active: boolean; onCapture: (slot: SweepSlot) => void }) {
  const [view, setView] = useState<View>(START);

  const yaw = useRef(0);
  const sign = useRef<1 | -1 | 0>(0);
  const span = useRef({ min: 0, max: 0 });
  const startedAt = useRef(0);
  const lastT = useRef<number | null>(null);
  const stepRef = useRef<SweepStep>("left");
  const capture = useEffectEvent(onCapture);

  useEffect(() => {
    if (!active) return;
    yaw.current = 0;
    sign.current = 0;
    span.current = { min: 0, max: 0 };
    lastT.current = null;
    stepRef.current = "left";
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

      // rotationRate: alpha = about z, beta = about x, gamma = about y (deg/s).
      const gn = Math.hypot(g.x, g.y, g.z) || 1;
      const rate = (rr.beta * g.x + rr.gamma * g.y + rr.alpha * g.z) / gn;
      yaw.current += rate * dt;

      // The first real excursion defines "left".
      if (sign.current === 0 && Math.abs(yaw.current) >= SWEEP_SIDE_DEG * 0.5) sign.current = yaw.current < 0 ? 1 : -1;
      const d = sign.current === 0 ? -Math.abs(yaw.current) : yaw.current * sign.current;
      span.current = { min: Math.min(span.current.min, yaw.current), max: Math.max(span.current.max, yaw.current) };

      if (stepRef.current === "left" && d <= -SWEEP_SIDE_DEG) {
        stepRef.current = "right";
        capture(0);
      } else if (stepRef.current === "right" && d >= SWEEP_SIDE_DEG) {
        stepRef.current = "centre";
        capture(2);
      } else if (stepRef.current === "centre" && Math.abs(d) <= CENTRE_TOLERANCE_DEG) {
        stepRef.current = "done";
        capture(1);
      }
      setView({ step: stepRef.current, delta: d, tooFast: Math.abs(rate) > TOO_FAST_DEG_PER_S });
    });
    return () => sub.remove();
  }, [active]);

  return {
    // Until the first sensor event of a new activation, show the start.
    ...(active ? view : START),
    /** What the server checks (plan §3.2). */
    result: () => ({
      spanDeg: Math.round(span.current.max - span.current.min),
      durationMs: Date.now() - startedAt.current,
    }),
  };
}
