import { Accelerometer, Magnetometer } from "expo-sensors";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { useDeclination, useHeading } from "./location";

/**
 * ── Which way the back camera faces ────────────────────────────────────────
 *
 * The AR screen needs the compass direction of the *back camera*, with the
 * phone held upright. The system heading doesn't give that on Android:
 * expo-location reports the direction the *top edge* of the phone points
 * (`SensorManager.getOrientation`, no axis remap), and held upright the top
 * edge points at the sky, so the reading wanders or flips 180° and every pin
 * lands in the wrong direction.
 *
 * So on Android this works it out from gravity and the magnetic field
 * directly (same maths as `SensorManager.getRotationMatrix`), for the
 * device's −Z axis (out of the back), then adds the local declination for
 * true north. iOS keeps the system heading: Core Location already reports
 * the direction the back of the phone faces once it's held upright.
 */

type Vec = { x: number; y: number; z: number };

const UPDATE_MS = 50;
/** Low-pass weight for each new sensor sample (lower = smoother, slower). */
const SMOOTHING = 0.2;
/** Same throttle as the system heading: at most every 100 ms, only for a real turn. */
const HEADING_MS = 100;
const HEADING_MIN_DEG = 2;
/**
 * How far the camera must point away from straight up/down (0–1, horizontal
 * share of its direction) for a heading to mean anything. Below it (phone
 * flat), the last heading is kept.
 */
const MIN_HORIZONTAL = 0.25;

const cross = (a: Vec, b: Vec): Vec => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (v: Vec): Vec | null => {
  const n = Math.hypot(v.x, v.y, v.z);
  return n < 1e-6 ? null : { x: v.x / n, y: v.y / n, z: v.z / n };
};

/**
 * Magnetic heading (degrees clockwise from magnetic north) of the device's
 * −Z axis, from Android-convention readings: `gravity` points up (the
 * accelerometer at rest), `magnetic` is the field in device axes. Null when
 * the phone is too close to flat for the camera to have a direction, or the
 * readings are degenerate.
 */
export function backCameraHeading(gravity: Vec, magnetic: Vec): number | null {
  const up = unit(gravity);
  if (!up) return null;
  const east = unit(cross(magnetic, up));
  if (!east) return null;
  const north = cross(up, east);
  // The camera looks along −Z: its east and north components are −east.z, −north.z.
  const e = -east.z;
  const n = -north.z;
  if (Math.hypot(e, n) < MIN_HORIZONTAL) return null;
  return ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360;
}

function useAndroidCameraHeading(enabled: boolean): { heading: number | null } {
  // Keeps the system heading watch running for its declination, and is the
  // fallback on a phone without a magnetometer.
  const { heading: systemHeading } = useHeading(enabled);
  const declination = useDeclination();
  const [magnetic, setMagnetic] = useState<number | null>(null);
  const [noSensor, setNoSensor] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let gravity: Vec | null = null;
    let field: Vec | null = null;
    let last: number | null = null;
    let lastAt = 0;
    const blend = (prev: Vec | null, next: Vec): Vec =>
      prev ? { x: prev.x + (next.x - prev.x) * SMOOTHING, y: prev.y + (next.y - prev.y) * SMOOTHING, z: prev.z + (next.z - prev.z) * SMOOTHING } : next;
    const update = () => {
      if (!gravity || !field) return;
      const deg = backCameraHeading(gravity, field);
      if (deg == null) return;
      const now = Date.now();
      const turned = last == null ? Infinity : Math.abs(((deg - last + 540) % 360) - 180);
      if (turned < HEADING_MIN_DEG || now - lastAt < HEADING_MS) return;
      last = deg;
      lastAt = now;
      setMagnetic(deg);
    };

    Accelerometer.setUpdateInterval(UPDATE_MS);
    Magnetometer.setUpdateInterval(UPDATE_MS);
    const subs = [
      Accelerometer.addListener((a) => {
        gravity = blend(gravity, a);
        update();
      }),
      Magnetometer.addListener((m) => {
        field = blend(field, m);
        update();
      }),
    ];
    void Magnetometer.isAvailableAsync().then((ok) => {
      if (live && !ok) setNoSensor(true);
    });
    return () => {
      live = false;
      subs.forEach((s) => s.remove());
    };
  }, [enabled]);

  if (!enabled) return { heading: null };
  if (noSensor) return { heading: systemHeading };
  return { heading: magnetic == null ? null : Math.round((magnetic + declination + 360) % 360) };
}

function useSystemCameraHeading(enabled: boolean): { heading: number | null } {
  return { heading: useHeading(enabled).heading };
}

/** Compass heading of the back camera (true north where known), or null until there is one. */
export const useCameraHeading = Platform.OS === "android" ? useAndroidCameraHeading : useSystemCameraHeading;
