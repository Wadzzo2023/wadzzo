/**
 * ── Pinhole projection for location-based AR ───────────────────────────────
 *
 * Turning "this drop is 40 m away at bearing 112°" into "draw it at 73% across
 * the screen" — correctly, so it lands on the spot in the camera image where
 * the real place actually is.
 *
 * The previous version mapped angle to screen linearly (`offset / FOV`) across
 * a 160° field. Both halves of that are wrong, and they compound:
 *
 *  1. **A real lens isn't linear.** A pinhole camera projects along a tangent:
 *     a point twice as far off-axis in *angle* lands more than twice as far
 *     off-centre on the sensor. Linear mapping squeezes everything toward the
 *     middle, increasingly so toward the edges.
 *
 *  2. **160° isn't a camera.** A phone's rear camera sees roughly 68° across
 *     its long axis. Spreading pins over 160° of overlay on top of a 68° image
 *     means a drop at the very edge of frame gets drawn near the centre. No
 *     amount of tuning fixes that, because it isn't a tuning problem — the
 *     overlay and the image are measuring the world at different scales.
 *
 * That 160 was arrived at honestly: it was cranked up (66 → 100 → 160) to damp
 * motion that felt too sensitive on a real device. But the sensitivity was
 * magnetometer jitter, not field of view — see the one-shot anchor in
 * `useDeviceHeading`. With the heading stable, the field of view can be what
 * it physically is, which is the only value that makes pins sit still over the
 * right patch of world.
 *
 * Everything here is pure and unit-tested. No React, no DOM.
 */

const DEG = Math.PI / 180;

/**
 * Field of view across the **long** axis of the camera frame, in degrees.
 *
 * Defined against the long axis rather than "horizontal" on purpose: a phone
 * held in portrait usually delivers a portrait-oriented frame, so which screen
 * axis is "wide" flips with orientation, while the sensor's own long axis
 * doesn't. `cameraFrustum` derives the short axis from the frame's aspect.
 *
 * ~68° is typical of a main/wide phone camera (iPhone wide ≈ 69-73°, most
 * Android mains ≈ 65-70°). Unlike the constant it replaces, this is a physical
 * quantity, not a comfort setting — turning it up to calm motion down would
 * just re-break alignment. To sanity-check it on a device: stand a known
 * distance from two landmarks, and a pin placed on one should stay on it while
 * you pan.
 */
export const CAMERA_LONG_FOV_DEG = 68;

/** Half-angle tangents of the region of the world actually visible on screen. */
export interface ViewFrustum {
  /** tan of half the visible horizontal field. */
  tanH: number;
  /** tan of half the visible vertical field. */
  tanV: number;
  hFovDeg: number;
  vFovDeg: number;
}

/**
 * The slice of the world the viewer can actually see, accounting for how the
 * video is fitted to the screen.
 *
 * The subtlety is `object-fit: cover`. The feed is scaled to fill the frame
 * and the overflow is cropped, so the visible field is *narrower* than the
 * camera's own — often dramatically, since a camera frame and a phone screen
 * rarely share an aspect ratio. Projecting against the uncropped field would
 * put every pin too close to centre by exactly the crop factor.
 *
 * @param videoAspect intrinsic `videoWidth / videoHeight`, or null when there
 *   is no feed (denied camera, desktop review) — in which case the container
 *   itself is treated as the frame, so the HUD still behaves sensibly.
 */
export function cameraFrustum(
  containerW: number,
  containerH: number,
  videoAspect: number | null,
  longAxisFovDeg: number = CAMERA_LONG_FOV_DEG,
): ViewFrustum {
  const containerAspect = containerW / Math.max(containerH, 1);
  const tanLong = Math.tan((longAxisFovDeg / 2) * DEG);

  // Split the frame's own field across its two axes. The long axis gets the
  // full angle; the short one is reduced by the aspect ratio — in tangent
  // space, which is where that ratio is linear.
  const aspect = videoAspect ?? containerAspect;
  const [tanHFull, tanVFull] =
    aspect >= 1 ? [tanLong, tanLong / aspect] : [tanLong * aspect, tanLong];

  // With no feed there's nothing to crop against — the container *is* the
  // frame, and the split above already used its aspect.
  if (videoAspect == null) return frustum(tanHFull, tanVFull);

  // `cover` matches whichever axis would otherwise leave a gap, and crops the
  // other. A frame wider than the container keeps its full height and loses
  // its sides; a narrower one keeps its width and loses top and bottom.
  return videoAspect > containerAspect
    ? frustum(tanHFull * (containerAspect / videoAspect), tanVFull)
    : frustum(tanHFull, tanVFull * (videoAspect / containerAspect));
}

function frustum(tanH: number, tanV: number): ViewFrustum {
  return {
    tanH,
    tanV,
    hFovDeg: (2 * Math.atan(tanH)) / DEG,
    vFovDeg: (2 * Math.atan(tanV)) / DEG,
  };
}

export interface Projected {
  /** Horizontal screen position, percent. 0 is the left edge, 100 the right. */
  x: number;
  /** Vertical screen position, percent, growing downward. */
  y: number;
  /** Metres along the camera's own forward axis. Negative means behind you. */
  forward: number;
  /** Within the visible frame (plus `margin`), and in front of the camera. */
  onScreen: boolean;
}

/**
 * Project a point given in camera-relative polar terms onto the screen.
 *
 * Deliberately takes the pin's *geometry* rather than a pre-computed vertical
 * angle, because pitch and bearing don't decompose into two independent 1-D
 * problems. Tilting the phone up doesn't just slide a pin down the screen; for
 * a pin off to one side it also swings it horizontally, because the camera
 * rotates about its own right axis, not the world's. Building the direction
 * vector and rotating it handles that for free, where two separate
 * `tan(angle)` terms quietly wouldn't.
 *
 * Roll is ignored: the scene doesn't counter-rotate for a tilted phone, so
 * modelling it here would place pins against a horizon the HUD doesn't draw.
 *
 * @param horizontalDistanceM ground distance to the pin
 * @param bearingOffsetDeg    signed degrees from the camera's heading, + right
 * @param verticalOffsetM     metres above the camera (negative for below)
 * @param cameraPitchDeg      degrees the camera is aimed above the horizon
 * @param margin              extra fraction of the frame still counted onscreen
 */
export function projectPoint(
  horizontalDistanceM: number,
  bearingOffsetDeg: number,
  verticalOffsetM: number,
  cameraPitchDeg: number,
  view: ViewFrustum,
  margin = 0,
): Projected {
  const a = bearingOffsetDeg * DEG;
  const p = cameraPitchDeg * DEG;
  const d = Math.max(horizontalDistanceM, 0.01);

  // Direction to the pin in a frame aligned with the camera's heading but
  // level with the horizon.
  const forwardLevel = d * Math.cos(a);
  const right = d * Math.sin(a);
  const up = verticalOffsetM;

  // Rotate that about the right axis by the camera's pitch, into the camera's
  // own frame. Pitching up tips the world down, hence the signs.
  const f = forwardLevel * Math.cos(p) + up * Math.sin(p);
  const u = -forwardLevel * Math.sin(p) + up * Math.cos(p);

  // Behind the camera (or in its plane): the projection diverges and screen
  // coordinates stop meaning anything. Report a far-offscreen position that
  // still carries the correct *side*, so an edge arrow points the short way
  // round rather than guessing.
  if (f <= 0.01) {
    return {
      x: right >= 0 ? 1e4 : -1e4,
      y: 50,
      forward: f,
      onScreen: false,
    };
  }

  const xNdc = right / f / view.tanH;
  const yNdc = u / f / view.tanV;

  return {
    x: 50 + 50 * xNdc,
    y: 50 - 50 * yNdc,
    forward: f,
    onScreen: Math.abs(xNdc) <= 1 + margin && Math.abs(yNdc) <= 1 + margin,
  };
}

/**
 * On-screen size, in pixels, of an object of a fixed real-world size.
 *
 * This is what actually sells depth. The formula it replaces fell off linearly
 * (`132 - distance * 0.85`), which over a 75 m capture radius is nearly flat —
 * a drop at 10 m and one at 30 m differed by about 14%, so everything read as
 * being at the same distance, and the scene looked like stickers on the glass.
 * Real objects shrink as `1/distance`: at 30 m that same drop is a third the
 * size it was at 10 m, which the eye reads as depth without being told.
 */
export function apparentSizePx(
  worldSizeM: number,
  rangeM: number,
  containerH: number,
  tanV: number,
): number {
  const range = Math.max(rangeM, 0.5);
  return (containerH * (worldSizeM / range)) / (2 * tanV);
}
