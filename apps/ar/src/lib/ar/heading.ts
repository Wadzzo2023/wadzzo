/**
 * ── Compass heading from device orientation ────────────────────────────────
 *
 * Turning `deviceorientation` into "which compass direction is the rear
 * camera pointing at" is not the one-liner it looks like.
 *
 * The obvious formula — `heading = 360 - alpha` — is only correct for a phone
 * lying **flat on its back**. It describes where the *top edge* of the device
 * points. In AR the phone is held upright, the top edge points at the sky,
 * and the direction that matters is the one the camera is aimed along. Those
 * are different axes, and the naive formula silently reports the wrong one.
 *
 * Worse, holding the phone upright puts `beta` near 90°, which is exactly the
 * gimbal-lock singularity of the ZXY Euler triple the spec uses: only
 * `alpha + gamma` is determined there, and browsers are free to split it
 * however they like. Two handsets pointing the same way can report
 * `alpha = 270, gamma = 0` and `alpha = 0, gamma = -90`. The naive formula
 * reads those as East and North respectively — a 90° error on a drop the
 * collector is standing next to.
 *
 * This used to be a hand-rolled rotation-matrix reconstruction. It's now a
 * port of `DeviceOrientationControls` — the standard three.js addon (by
 * WestLangley, long the reference implementation LocAR.js and most
 * location-AR projects build on) — expressed as a quaternion instead of raw
 * trig. The physics is identical; a quaternion is just a representation of
 * the same rotation that composes without the axis-order footguns hand
 * derivations invite. Verified to reproduce this module's exact outputs
 * (`heading.test.ts`) before replacing the trig version.
 *
 * World frame is ENU: +X east, +Y north, +Z up.
 * Device frame: +X right of screen, +Y top of screen, +Z out of the screen
 * toward the viewer — so the rear camera looks along **-Z**.
 */

import { Euler, Quaternion, Vector3 } from "three";

const DEG = Math.PI / 180;

/** Shortest signed difference from `a` to `b`, in (-180, 180]. */
export function angleDelta(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

export const normalize360 = (deg: number) => ((deg % 360) + 360) % 360;

/**
 * Below this horizontal magnitude the camera axis is pointing too close to
 * straight up or straight down for its azimuth to mean anything, and we fall
 * back to the top-edge axis (which is what `360 - alpha` computes).
 *
 * This is the phone-lying-flat case: the camera faces the table, and there is
 * genuinely no horizontal direction to report. Without the fallback the
 * heading would be pure atan2 noise while someone raises the phone.
 */
const DEGENERATE = 0.15;

// Scratch objects, reused across calls rather than allocated per-frame — this
// runs once per animation frame for the whole time AR is open.
const _euler = new Euler();
const _quat = new Quaternion();
// -90° about X: reorients the rotation so the camera looks out the device's
// back (-Z becomes forward) instead of out its top, matching the physical
// phone rather than the raw device-orientation coordinate frame.
const _backFacing = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
const _forward = new Vector3();
const _topEdge = new Vector3();

/**
 * The device's rotation as a quaternion, device axes → world axes, with the
 * rear camera's forward direction already folded in as -Z. Shared by
 * `headingFromEuler` and `elevationFromEuler` so they can't drift apart on
 * how the rotation itself is built.
 */
function deviceQuaternion(alpha: number, beta: number, gamma: number): Quaternion {
  // Intrinsic Tait-Bryan Z-X'-Y'' — the DeviceOrientation spec's own order,
  // expressed as three.js's 'YXZ' Euler (their axis-name convention is
  // rotated one step from the spec's, not the order itself).
  _euler.set(beta * DEG, alpha * DEG, -gamma * DEG, "YXZ");
  return _quat.setFromEuler(_euler).multiply(_backFacing);
}

/**
 * Compass heading, in degrees clockwise from north, that the rear camera is
 * pointing. Returns null when the orientation triple is unusable.
 *
 * @param alpha rotation about Z, degrees, counter-clockwise from north
 * @param beta  rotation about X', degrees
 * @param gamma rotation about Y'', degrees
 */
export function headingFromEuler(
  alpha: number | null,
  beta: number | null,
  gamma: number | null,
): number | null {
  if (alpha == null || beta == null || gamma == null) return null;
  if (!Number.isFinite(alpha) || !Number.isFinite(beta) || !Number.isFinite(gamma)) return null;

  const q = deviceQuaternion(alpha, beta, gamma);
  _forward.set(0, 0, -1).applyQuaternion(q);

  if (Math.hypot(_forward.x, _forward.z) >= DEGENERATE) {
    return normalize360(Math.atan2(_forward.x, -_forward.z) / DEG);
  }

  // Camera is pointing at the floor or the sky — use the top edge instead,
  // same fallback the naive `360 - alpha` formula amounts to.
  _topEdge.set(0, 1, 0).applyQuaternion(q);
  if (Math.hypot(_topEdge.x, _topEdge.z) < 1e-6) return null;

  return normalize360(Math.atan2(_topEdge.x, -_topEdge.z) / DEG);
}

/**
 * How far above the horizon the rear camera is aimed, in degrees.
 * Positive is up: 0 is level, +90 is straight at the sky, -90 at your feet.
 *
 * This is the other half of world-anchoring. Heading alone only fixes a pin
 * horizontally — without elevation the scene ignores pitch entirely, pins
 * stay pasted at the same screen height however you tilt, and the whole thing
 * reads as a HUD stuck to the glass rather than objects standing in the
 * street.
 *
 * The forward vector's world-up component, which for a unit vector is just
 * its arcsine. Independent of `alpha` by construction — rotating about the
 * vertical axis can't change how far up or down the camera tips — so it stays
 * meaningful even where the heading itself is degenerate.
 */
export function elevationFromEuler(beta: number | null, gamma: number | null): number | null {
  if (beta == null || gamma == null) return null;
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;

  const q = deviceQuaternion(0, beta, gamma);
  _forward.set(0, 0, -1).applyQuaternion(q);
  return Math.asin(Math.max(-1, Math.min(1, _forward.y))) / DEG;
}

/**
 * iOS never fires `deviceorientationabsolute`, and its `alpha` is referenced
 * to an arbitrary origin rather than north — so alpha alone can't give an
 * absolute heading there. What it does give is `webkitCompassHeading`, an
 * absolute, true-north (not magnetic) reading of the top edge.
 *
 * Rather than use that value directly — it has the same held-upright problem
 * as the naive formula — we invert it back into the north-referenced `alpha`
 * it implies, and feed that through the matrix above. This is the approach
 * AR.js settled on, and it keeps one code path for both platforms.
 *
 * iOS also reports `webkitCompassHeading` as **`-1`** whenever the compass is
 * uncalibrated or the reading is otherwise invalid — a real, documented
 * sentinel, not a rare edge case. Trusting it anyway aims the whole scene at
 * whatever `360 - (-1) = 361 → 1°` computes to for exactly one frame, before
 * the next good sample corrects it — which is indistinguishable from the
 * scene briefly swinging the wrong way. Any negative reading is rejected in
 * favour of falling back to plain `alpha`, which — while not north-referenced
 * — is at least a real, continuous signal rather than a fixed decoy heading.
 */
export function absoluteAlpha(
  alpha: number | null,
  webkitCompassHeading: number | null | undefined,
): number | null {
  if (
    webkitCompassHeading != null &&
    Number.isFinite(webkitCompassHeading) &&
    webkitCompassHeading >= 0
  ) {
    return normalize360(360 - webkitCompassHeading);
  }
  return alpha;
}

/**
 * The average of a set of angles, done on the circle rather than the number
 * line. Returns null for an empty set, or for one with no consensus at all
 * (samples spread evenly around the compass, so their vector sum cancels).
 *
 * A plain arithmetic mean is wrong for angles: 359° and 1° average to 180°,
 * pointing exactly opposite the two readings it came from. Summing unit
 * vectors and taking the resulting direction has no such seam.
 *
 * Used to combine the handful of compass samples taken during the one-shot
 * anchor (see `useDeviceHeading`) into a single north reference. Averaging
 * matters there precisely because any *individual* magnetometer reading is
 * noisy — which is the whole reason the live path stops reading it.
 */
export function circularMean(degrees: number[]): number | null {
  if (degrees.length === 0) return null;

  let x = 0;
  let y = 0;
  for (const d of degrees) {
    if (!Number.isFinite(d)) continue;
    x += Math.cos(d * DEG);
    y += Math.sin(d * DEG);
  }

  // Vector sum ~zero means the samples point every which way and their mean
  // direction is genuinely undefined — better to report that than to return
  // whatever atan2(0, 0) happens to be.
  if (Math.hypot(x, y) < 1e-9) return null;

  return normalize360(Math.atan2(y, x) / DEG);
}

/**
 * One low-pass step toward `target`, interpolating the short way around the
 * 0/360 wrap.
 *
 * Without the wrap handling, a heading easing from 359° to 2° would travel
 * 357° the wrong way and spin the entire scene past the viewer. `factor`
 * is slow enough to kill sensor jitter, fast enough that a deliberate turn
 * doesn't lag the hand.
 */
export function smoothHeading(current: number, target: number, factor = 0.18) {
  return normalize360(current + angleDelta(current, target) * factor);
}
