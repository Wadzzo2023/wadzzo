import { bearingDegrees, distanceMeters, offsetBy } from "~/lib/ar/geo";
import type { Coords } from "~/lib/ar/types";

import { PIN_FLOAT_HEIGHT_M } from "./coinGeometry";

/**
 * ── GPS → AR scene ─────────────────────────────────────────────────────────
 *
 * The scene uses `worldAlignment="Gravity"` on both platforms (true-north
 * alignment is iOS-only), so north has to be supplied: a calibration records,
 * at one instant, where the camera is in the scene, which way it faces there
 * (its yaw), which way that is on the compass, and the GPS fix. Every pin is
 * then placed relative to that — same maths as Viro's own `gpsToArWorld`,
 * anchored to a calibration instead of a geospatial pose.
 *
 * Constants are the web scene's (ArSceneWebGL): eye height 1.6 m, true scale
 * until 15 m then eased up to 3.2× by capture range, view-only pins placed at
 * 30 m on their true bearing.
 */

export const CAMERA_HEIGHT_M = 1.6;
export const TRUE_SCALE_UNTIL_M = 15;
export const MAX_DISTANCE_SCALE = 3.2;
export const VIEW_ONLY_RADIUS_M = 30;

export type Calibration = {
  /** GPS fix at calibration. */
  fix: Coords;
  /** Camera position in scene metres at calibration. */
  origin: { x: number; y: number; z: number };
  /** Compass heading (deg, CW from north) that scene −Z points to. */
  sceneNorthOffset: number;
};

/** Camera yaw in the scene, degrees clockwise from −Z. */
export function yawFromForward(forward: readonly number[]) {
  const [fx = 0, , fz = -1] = forward;
  return ((Math.atan2(fx, -fz) * 180) / Math.PI + 360) % 360;
}

export function calibrate(fix: Coords, cameraPos: readonly number[], cameraForward: readonly number[], compassHeading: number): Calibration {
  return {
    fix,
    origin: { x: cameraPos[0] ?? 0, y: cameraPos[1] ?? 0, z: cameraPos[2] ?? 0 },
    sceneNorthOffset: (compassHeading - yawFromForward(cameraForward) + 360) % 360,
  };
}

/** Scene position (metres) for a lat/lng, at pin float height. */
export function placeInScene(cal: Calibration, target: Coords): [number, number, number] {
  const d = distanceMeters(cal.fix, target);
  const b = bearingDegrees(cal.fix, target);
  const rel = ((b - cal.sceneNorthOffset) * Math.PI) / 180;
  return [cal.origin.x + d * Math.sin(rel), cal.origin.y - CAMERA_HEIGHT_M + PIN_FLOAT_HEIGHT_M, cal.origin.z - d * Math.cos(rel)];
}

/** View-only mode: a far pin is drawn at 30 m along its true bearing. */
export function viewOnlyTarget(fix: Coords, pin: Coords): Coords {
  const real = distanceMeters(fix, pin);
  if (real <= VIEW_ONLY_RADIUS_M) return pin;
  return offsetBy(fix, VIEW_ONLY_RADIUS_M, bearingDegrees(fix, pin));
}

/** Legibility scale: true size until 15 m, eased to 3.2× at capture range. */
export function legibilityScale(rangeM: number, captureRadius: number) {
  const over = Math.max(0, rangeM - TRUE_SCALE_UNTIL_M);
  return Math.min(MAX_DISTANCE_SCALE, 1 + (over / (captureRadius - TRUE_SCALE_UNTIL_M)) * (MAX_DISTANCE_SCALE - 1));
}

/** Angle (deg) between the camera's forward ray and the direction to a point. */
export function aimAngle(cameraPos: readonly number[], forward: readonly number[], point: readonly number[]) {
  const dx = (point[0] ?? 0) - (cameraPos[0] ?? 0);
  const dy = (point[1] ?? 0) - (cameraPos[1] ?? 0);
  const dz = (point[2] ?? 0) - (cameraPos[2] ?? 0);
  const len = Math.hypot(dx, dy, dz) || 1;
  const flen = Math.hypot(forward[0] ?? 0, forward[1] ?? 0, forward[2] ?? 0) || 1;
  const dot = (dx * (forward[0] ?? 0) + dy * (forward[1] ?? 0) + dz * (forward[2] ?? 0)) / (len * flen);
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

/** Signed horizontal angle to a point relative to the camera's facing (−left, +right). */
export function relativeYaw(cameraPos: readonly number[], forward: readonly number[], point: readonly number[]) {
  const toYaw = yawFromForward([(point[0] ?? 0) - (cameraPos[0] ?? 0), 0, (point[2] ?? 0) - (cameraPos[2] ?? 0)]);
  const d = toYaw - yawFromForward(forward);
  return ((d + 540) % 360) - 180;
}
