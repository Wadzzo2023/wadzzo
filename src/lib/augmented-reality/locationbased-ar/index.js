/**
 * ── locationbased-ar ───────────────────────────────────────────────────────
 *
 * A real WebGL location-AR engine, vendored from the sibling `bandfan`
 * project (`src/lib/augmented-reality/locationbased-ar`), which itself
 * adapts AR.js's location-based components and three.js's own (now removed
 * from three.js core) `DeviceOrientationControls`.
 *
 * Replaces wadzzoAR's earlier hand-rolled approach — a flat CSS-percentage
 * projection driven by a from-scratch Euler-to-heading conversion — which
 * went through many rounds of real-device bugs (dual-event oscillation, an
 * iOS compass sentinel, gain/FOV tuning that never felt right) because it was
 * reimplementing, with less coverage, what this library already does
 * correctly:
 *
 *  - `LocationBased` converts GPS lon/lat into a flat local metre-scale
 *    world plane (Web Mercator, relative to the first GPS fix) and places
 *    the camera and every object at true 3D positions in it. There is no
 *    hand-computed "bearing minus heading, divided by an assumed FOV" — a
 *    real `THREE.PerspectiveCamera` does correct perspective projection,
 *    which is what a hardcoded FOV constant was only ever approximating.
 *
 *  - `DeviceOrientationControls` drives the camera's rotation directly from
 *    device-orientation events as a quaternion, the same technique
 *    `src/lib/ar/heading.ts` was separately ported to reproduce for the old
 *    system — here it's the actual thing, not a port of it.
 *
 *  - `WebcamRenderer` and `ClickHandler` round out the engine: the camera
 *    feed as a WebGL background layer, and raycasting for tap-to-select.
 *
 * Untouched from the bandfan copy (down to the `@ts-nocheck` pragmas each
 * file already carries) so it stays easy to diff against the working
 * reference if either project's copy needs a fix later.
 */
import { LocationBased } from "./location-based.js";
import { WebcamRenderer } from "./webcam-renderer.js";
import { DeviceOrientationControls } from "./device-orientation-controls.js";
import { ClickHandler } from "./click-handler.js";

export {
  LocationBased,
  WebcamRenderer,
  DeviceOrientationControls,
  ClickHandler,
};
