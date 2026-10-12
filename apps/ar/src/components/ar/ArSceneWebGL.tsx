import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "~/lib/navigation";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { CameraModeSwitch } from "~/components/ar/CameraModeSwitch";
import { CollectButton } from "~/components/ar/CollectButton";
import { ArRadar, CompassStrip, EdgeArrow, Reticle, type Placed } from "~/components/ar/ArScene";
import { ArButton } from "~/components/ui/ArButton";
import {
  AR_CAPTURE_RADIUS,
  bearingDegrees,
  distanceMeters,
  offsetBy,
} from "@wadzzo/ar-core/ar/geo";
import { angleDelta } from "~/lib/ar/heading";
import { cameraFrustum } from "~/lib/ar/projection";
import { pinStatus } from "@wadzzo/ar-core/ar/rarity";
import type { ArPin, GeoFix } from "@wadzzo/ar-core/ar/types";
import { ArPinObject3D, PIN_FLOAT_HEIGHT_M } from "~/lib/ar/webgl/ArPinObject3D";
import {
  ClickHandler,
  DeviceOrientationControls,
  LocationBased,
} from "~/lib/augmented-reality/locationbased-ar";

/** Eye height the camera sits at, metres — a phone held up to look through. */
const CAMERA_HEIGHT_M = 1.6;

/**
 * How much bigger a distant pin is drawn than its true size, to stay findable.
 *
 * A 1.2 m disc at 70 m subtends about a degree — perhaps fifteen pixels, too
 * small to see or tap. True scale is kept where it matters (anywhere near
 * capture range, which is where someone is actually looking at the object) and
 * eased up beyond that purely for legibility. It is a deliberate, bounded lie:
 * below `TRUE_SCALE_UNTIL_M` there is no exaggeration at all, so the depth cue
 * that sells presence stays honest exactly where it's being judged.
 */
const TRUE_SCALE_UNTIL_M = 15;
const MAX_DISTANCE_SCALE = 3.2;

/**
 * How far away a single view-only pin (`focusPinId`/`ignoreRange` mode) is
 * *rendered*, in metres, when the real drop is further than that.
 *
 * `LocationBased` places every pin at its true GPS-projected position, and
 * the camera's far clip plane is 1000 m — so a pin genuinely on the other
 * side of the world would sit millions of metres away in world space,
 * outside the renderable frustum forever. No amount of turning would ever
 * bring it into frame; "View in AR" would silently show an empty scene.
 *
 * View-only mode exists specifically to let a card be looked at "from
 * anywhere," so the pin is placed this many metres away along its *true
 * bearing* instead — visible, and still pointing the right direction — while
 * every number and gate that isn't purely about where the mesh sits keeps
 * using the real distance. See the pins-sync effect and `setRangeInfo` below
 * for the split: what's faked is placement only, never the numbers or
 * whether it can actually be collected.
 */
const VIEW_ONLY_RADIUS_M = 30;

/**
 * ── ArSceneWebGL ───────────────────────────────────────────────────────────
 *
 * Real 3D pins in a real WebGL scene, using `locationbased-ar` — the engine
 * vendored from the sibling `bandfan` project (see its `index.js` for the
 * full rationale). Every pin sits at a true metre-scale world position,
 * computed from GPS via a Web Mercator projection; the camera's rotation is
 * driven directly by device-orientation events as a quaternion. Three.js's
 * own perspective camera does the actual screen projection — there is no
 * hand-tuned FOV constant here, no bearing-minus-heading arithmetic, and
 * nothing to retune, which is the entire reason this replaces the earlier
 * flat CSS-percentage version.
 *
 * The HUD around the canvas — reticle, compass ribbon, radar, edge arrows
 * and the Capture button — is imported straight from the old `ArScene`. The
 * pin's *information* card is not: it hangs in the world next to its own coin
 * (see `ArPinObject3D.createCardSprite`), so it shares the pin's position and
 * perspective instead of describing it from the bottom of the screen. None of that was ever the problem; only
 * the engine placing and tracking the pins underneath it was. Those pieces
 * still want a `Placed`-shaped angle (offset/verticalOffset/distance) to
 * draw the radar dot or point an edge arrow, so this component derives that
 * purely as a *display* value from the camera's live position and rotation
 * each frame — a read of where things are, never what moves them.
 *
 * Assumes camera, location and motion permissions are already granted by the
 * time this mounts (the existing `ArPermissionGate` flow in `ar.tsx` collects
 * all three first) — `DeviceOrientationControls.init()` and `getUserMedia`
 * both resolve instantly against an already-granted permission within the
 * same tab session, so nothing here re-prompts.
 */
export function ArSceneWebGL({
  pins,
  fix,
  onCapture,
  videoEl,
  videoElement,
  focusPinId,
  ignoreRange,
  preferPinId,
}: {
  pins: ArPin[];
  fix: GeoFix | null;
  onCapture: (pin: ArPin) => void;
  /**
   * The camera feed, rendered as an ordinary DOM `<video>` *behind* the
   * transparent WebGL canvas — not sampled into a texture inside it.
   *
   * The texture route is the obvious one and it fails on the target device.
   * iOS Safari will not decode frames for a video it considers invisible, and
   * a video that exists only to feed `THREE.VideoTexture` has no reason to be
   * on screen — so it gets sized to a pixel and hidden, the decoder never
   * runs, the texture stays empty, and the result is a black screen with the
   * pins floating on it. Keeping the element real and visible sidesteps that
   * entirely, lets CSS `object-fit: cover` do the cropping natively, and skips
   * a per-frame texture upload.
   *
   * Owned by the parent because `useCamera()` acquired the stream on the
   * permission gate, before this scene existed.
   */
  videoEl: React.ReactNode;
  /**
   * The same element as a node, for its intrinsic `videoWidth`/`videoHeight`.
   * That is what the virtual camera's field of view is derived from — see
   * `handleResize` — and it cannot be read off a ReactNode.
   */
  videoElement: HTMLVideoElement | null;
  /** Single-pin mode, reached from a collected card or a drop's own page. */
  focusPinId?: string;
  /**
   * View-only mode: the pin renders regardless of true distance — clamped to
   * `VIEW_ONLY_RADIUS_M` along its real bearing when it's further than that —
   * so a card can be looked at "from anywhere." This does **not** mean it can
   * be *collected* from anywhere: capture eligibility, the card's own "IN
   * RANGE"/"TOO FAR" status and distance readout, and the bottom button all
   * keep checking the real, true GPS distance against `AR_CAPTURE_RADIUS`
   * regardless of this flag. What it changes is purely where the mesh is
   * drawn, never what's true about it.
   */
  ignoreRange?: boolean;
  /** A pin to prefer as the initial target once it enters the focus cone. */
  preferPinId?: string;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [heading, setHeading] = useState(0);
  const [targetPin, setTargetPin] = useState<ArPin | null>(null);
  const [manual, setManual] = useState(false);
  const [viewport, setViewport] = useState({ w: 430, h: 850 });
  /**
   * `LocationBased.add()` projects a pin's lon/lat against `initialPosition`
   * — the world origin, set the first time a GPS fix (real or `fakeGps`)
   * comes in — and *throws a bare string* (not an `Error`) if that origin
   * isn't set yet. Pins can easily be ready before the first fix lands, so
   * the pins-sync effect below must never call `add()` until this flips
   * true, no matter which effect happens to run first on a given commit.
   */
  const [originReady, setOriginReady] = useState(false);

  // Mutable engine handles — imperative by nature (Three.js owns its own
  // object graph), kept in refs rather than state so the render loop never
  // waits on a React re-render to see its own last frame's work.
  const pinObjectsRef = useRef<Map<string, ArPinObject3D>>(new Map());
  const locarRef = useRef<InstanceType<typeof LocationBased> | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const openCardIdRef = useRef<string | null>(null);
  const preferredIdRef = useRef<string | null>(preferPinId ?? null);
  // The render loop is created once and closes over its mount-time scope, so
  // props it needs per-frame have to reach it through a ref that each render
  // refreshes, not through the closure.
  // The render loop needs the *real* GPS fix every frame, to show true
  // distance/eligibility even for a pin whose mesh is placed at a faked,
  // view-only position — see `VIEW_ONLY_RADIUS_M`.
  const fixRef = useRef(fix);
  fixRef.current = fix;
  const disposeRef = useRef<(() => void) | null>(null);

  // ── Engine setup — once, on mount ────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const video = videoElement;
    if (!container) return;

    let cancelled = false;

    const scene = new THREE.Scene();
    // FOV is set for real in `handleResize` below, from the actual feed —
    // this is only a placeholder until the video reports its dimensions.
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      1000,
    );
    camera.position.set(0, CAMERA_HEIGHT_M, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Fully transparent: the camera feed is a plain DOM `<video>` layered
    // underneath this canvas, not a texture drawn inside it. See the note on
    // `videoEl` in the props for why.
    renderer.setClearColor(0x000000, 0);

    // The canvas is appended imperatively, so it lands after React's children
    // in document order. Without an explicit layer it would paint above the
    // positioned video beneath it and hide the camera entirely. Sits at 10:
    // above the feed (0), below every HUD element (20+).
    Object.assign(renderer.domElement.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      zIndex: "10",
    });
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(5, 10, 5);
    scene.add(sun);

    const locar = new LocationBased(scene, camera);
    locarRef.current = locar;

    const deviceOrientationControls = new DeviceOrientationControls(camera);
    const clickHandler = new ClickHandler(renderer);
    const raycaster = new THREE.Raycaster();

    let disposed = false;

    const setup = async () => {
      if (deviceOrientationControls.requiresPermission()) {
        const ok = await deviceOrientationControls.init();
        if (!ok) setManual(true);
      }
      if (cancelled || disposed) return;

      /**
       * Match the virtual camera to the real one.
       *
       * This is the single most important line in the file for whether the
       * scene reads as augmented reality or as 3D pasted over video. A
       * perspective camera whose field of view differs from the lens behind it
       * projects the world at a different rate than the footage does: pins
       * drift against the background as you pan, slowly, in a way that looks
       * like bad tracking but is actually a mismatched frustum. It was 75°
       * against a lens seeing ~38° after crop.
       *
       * `cameraFrustum` accounts for `object-fit: cover` — the feed is cropped
       * to fill the screen, so the *visible* field is narrower than the
       * camera's own. three.js takes a vertical FOV plus an aspect ratio, and
       * the frustum's two axes are consistent by construction
       * (`tanH === tanV * containerAspect`), so setting those two is enough to
       * get both right.
       */
      const handleResize = () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        renderer.setSize(w, h);

        const aspect =
          video && video.videoWidth > 0 && video.videoHeight > 0
            ? video.videoWidth / video.videoHeight
            : null;
        const view = cameraFrustum(w, h, aspect);

        camera.fov = view.vFovDeg;
        camera.aspect = w / Math.max(h, 1);
        camera.updateProjectionMatrix();

        setViewport({ w, h });
      };
      handleResize();
      window.addEventListener("resize", handleResize);
      window.addEventListener("orientationchange", handleResize);
      // The feed's dimensions — which the frustum depends on — aren't known
      // until metadata arrives, which is usually after this effect has run.
      // Without this the camera would keep the no-feed fallback FOV for the
      // whole session and nothing would line up.
      video?.addEventListener("loadedmetadata", handleResize);

      let focusStart: number | null = null;
      let unfocusStart: number | null = null;
      const FOCUS_OPEN_MS = 550;
      const FOCUS_CLOSE_MS = 400;

      const onClick = () => {
        const [hit] = clickHandler.raycast(camera, scene);
        const pinId = findPinId(hit?.object);
        if (pinId) preferredIdRef.current = pinId;
      };
      renderer.domElement.addEventListener("click", onClick);

      renderer.setAnimationLoop(() => {
        deviceOrientationControls.update();

        for (const [id, obj] of pinObjectsRef.current) {
          obj.update(camera);

          // Keep each card's own copy of "how far, close enough?" current —
          // it repaints only when the rendered text would actually change.
          //
          // Deliberately the *real* GPS distance, not the mesh's position in
          // the scene — those two disagree exactly when this pin is being
          // shown at a view-only clamped placement (`VIEW_ONLY_RADIUS_M`),
          // and the card must tell the truth about how far away the drop
          // really is regardless of how close it's drawn.
          const currentFix = fixRef.current;
          const real = currentFix
            ? distanceMeters(currentFix, obj.getPin())
            : Math.hypot(
                camera.position.x - obj.getMesh().position.x,
                camera.position.z - obj.getMesh().position.z,
              );
          obj.setRangeInfo(real, real <= AR_CAPTURE_RADIUS);

          // The focused pin shows its card; everything else hides its own.
          if (id === openCardIdRef.current) obj.open();
          else obj.close();

          // Legibility scaling, applied here rather than baked into the mesh
          // so the object keeps its true size in the world and only its
          // *drawn* size is eased up once it's too far to make out. Distance
          // is measured in the scene, from the camera, so it stays right as
          // the viewer walks.
          const mesh = obj.getMesh();
          const range = camera.position.distanceTo(mesh.position);
          const over = Math.max(0, range - TRUE_SCALE_UNTIL_M);
          const scale = Math.min(
            MAX_DISTANCE_SCALE,
            1 + (over / (AR_CAPTURE_RADIUS - TRUE_SCALE_UNTIL_M)) * (MAX_DISTANCE_SCALE - 1),
          );
          mesh.scale.setScalar(scale);
        }

        renderer.render(scene, camera);

        // Screen-centre raycast — "aiming is the pointer", same phrase the
        // old scene's own doc comment used, now driven by a real camera
        // instead of an angle threshold against a hand-tracked heading.
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const meshes = [...pinObjectsRef.current.values()].map((o) => o.getMesh());
        const centreHit = raycaster.intersectObjects(meshes)[0];
        const centrePinId = findPinId(centreHit?.object);

        if (centrePinId) {
          unfocusStart = null;
          if (centrePinId !== openCardIdRef.current) {
            if (focusStart == null) focusStart = Date.now();
            else if (Date.now() - focusStart >= FOCUS_OPEN_MS) {
              openCardIdRef.current = centrePinId;
              focusStart = null;
              const obj = pinObjectsRef.current.get(centrePinId);
              if (obj) setTargetPin(obj.getPin());
            }
          }
        } else {
          focusStart = null;
          if (openCardIdRef.current != null) {
            if (unfocusStart == null) unfocusStart = Date.now();
            else if (Date.now() - unfocusStart >= FOCUS_CLOSE_MS) {
              openCardIdRef.current = null;
              unfocusStart = null;
              setTargetPin(null);
            }
          }
        }

        // A tap wins immediately, same as the old `lockedId` override.
        if (preferredIdRef.current) {
          const obj = pinObjectsRef.current.get(preferredIdRef.current);
          if (obj) {
            openCardIdRef.current = preferredIdRef.current;
            setTargetPin(obj.getPin());
          }
          preferredIdRef.current = null;
        }

        // Heading readout for the compass ribbon / radar — a display value
        // read off the camera's actual rotation, computed the same way
        // `lib/ar/heading.ts` derives it from raw device angles, just from
        // the quaternion the engine already has rather than a second copy of
        // the sensor pipeline.
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const h = (Math.atan2(forward.x, -forward.z) * 180) / Math.PI;
        setHeading(((h % 360) + 360) % 360);
      });

      disposeRef.current = () => {
        disposed = true;
        renderer.setAnimationLoop(null);
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("orientationchange", handleResize);
        video?.removeEventListener("loadedmetadata", handleResize);
        renderer.domElement.removeEventListener("click", onClick);
        deviceOrientationControls.dispose();
        for (const obj of pinObjectsRef.current.values()) obj.dispose();
        pinObjectsRef.current.clear();
        renderer.dispose();
        container.removeChild(renderer.domElement);
      };
    };

    setup().catch((err: unknown) => {
      console.error("ArSceneWebGL engine setup failed:", err);
    });

    return () => {
      cancelled = true;
      disposeRef.current?.();
      disposeRef.current = null;
    };
    // Keyed on `videoElement` rather than `[]`: the parent's `useCamera()`
    // hands back `videoNode` a render *after* `attachVideo`'s ref callback
    // actually fires (it's state, set from inside the callback, and a ref
    // callback commits before that state update is visible to this render).
    // So the very first render this component sees always has
    // `videoElement === null`, and a `[]`-keyed effect would bail on that
    // first run — via the guard above — and then never get a second chance,
    // since empty deps never re-fire. Keying on `videoElement` lets the one
    // real transition (null → the live node) re-run this effect and build
    // the engine; every render after that keeps the same node reference, so
    // it doesn't re-run again. Pins and GPS are synced by the effects below
    // via the live `locar`/`pinObjectsRef` handles rather than by re-running
    // this whole setup.
  }, [videoElement]);

  // ── Keep pins in sync with the live query ────────────────────────────────
  useEffect(() => {
    const locar = locarRef.current;
    // `originReady` gates this on top of the null check: the engine can
    // exist before it has a GPS-derived world origin, and `locar.add()`
    // throws if called that early (see the `originReady` doc comment above).
    if (!locar || !originReady) return;

    const scoped = focusPinId ? pins.filter((p) => p.id === focusPinId) : pins;
    const nextIds = new Set(scoped.map((p) => p.id));
    const existing = pinObjectsRef.current;

    for (const [id, obj] of existing) {
      if (!nextIds.has(id)) {
        obj.dispose();
        existing.delete(id);
      }
    }

    for (const pin of scoped) {
      if (existing.has(pin.id)) continue;
      const obj = new ArPinObject3D(pin);

      // Where the mesh actually goes: the pin's real coordinates, unless
      // this is view-only mode *and* the real drop is further than
      // `VIEW_ONLY_RADIUS_M` — in which case it's placed that far away along
      // its true bearing instead, so it renders inside the camera's far clip
      // plane rather than sitting millions of metres away, unreachable by
      // turning, if the drop is genuinely a continent away. Nothing else
      // about the pin is faked: `setRangeInfo` (the render loop below) and
      // `capturable` (this component's own return value) both keep computing
      // against the *real* fix, so the card and the Capture button still
      // tell the truth even while the mesh sits somewhere it isn't.
      let lng = pin.lng;
      let lat = pin.lat;
      if (ignoreRange && fix) {
        const real = distanceMeters(fix, pin);
        if (real > VIEW_ONLY_RADIUS_M) {
          const bearing = bearingDegrees(fix, pin);
          const virtual = offsetBy(fix, VIEW_ONLY_RADIUS_M, bearing);
          lng = virtual.lng;
          lat = virtual.lat;
        }
      }

      // Height is absolute ground-relative, not camera-relative: the pin hangs
      // `PIN_FLOAT_HEIGHT_M` above the pavement and stays there, which is what
      // lets its shadow sit on the ground and what makes crouching or raising
      // the phone change your view of it rather than move it.
      locar.add(obj.getMesh(), lng, lat, PIN_FLOAT_HEIGHT_M);
      existing.set(pin.id, obj);
    }
    // `videoElement`, `originReady` and `fix` aren't read for their own sake
    // here — they're re-sync triggers, not new inputs to the diffing logic
    // above `nextIds` already uses. `locarRef` only exists once the engine
    // effect above has run, and it only has a world origin once the GPS
    // effect below has fed it a fix; `pins`/`focusPinId` may well have
    // already settled into their current value before either of those
    // happens (the query resolves on mount; the engine and its origin arrive
    // on later renders). Without this, a pin set that never changes again
    // after that point would simply never make it into `locar` — and in
    // view-only mode specifically, `fix` is what the virtual placement above
    // is computed from, so a fix that only arrives *after* this effect first
    // ran needs its own re-run too, or the pin would end up placed at its
    // real (possibly unreachable) coordinates instead.
    //
    // Deliberately *not* re-run on every subsequent `fix` update once a pin
    // already exists — `existing.has(pin.id)` skips it, so a view-only pin's
    // virtual placement is computed once and then held still rather than
    // drifting with the viewer's own GPS noise.
  }, [pins, focusPinId, videoElement, originReady, fix, ignoreRange]);

  // ── Feed GPS fixes from the parent's own geolocation hook ───────────────
  // `LocationBased` can watch position itself, but the parent already runs
  // `useGeolocation()` — its own accuracy filtering, its own gate UI. Two
  // independent watches would be redundant and could disagree; `fakeGps`
  // exists precisely to hand the engine a position from elsewhere.
  // `videoElement` is a re-sync trigger for the same reason as the effect
  // above: `fix` can already be stable by the time the engine actually
  // exists to receive it.
  useEffect(() => {
    if (!fix) return;
    const locar = locarRef.current;
    // Bail rather than optional-chain past this: a location fix routinely
    // arrives before the engine does (geolocation tends to resolve faster
    // than the video element attaches), and only setting `originReady` once
    // `fakeGps` has *actually* run against a real `locar` is what keeps the
    // pins-sync effect from racing ahead of a `locar` that has no origin
    // yet. This effect fires again on its own once `videoElement` flips to
    // the live node, by which point `locarRef.current` is guaranteed set —
    // the engine-setup effect above runs first in that same commit.
    if (!locar) return;
    locar.fakeGps(fix.lng, fix.lat);
    setOriginReady(true);
  }, [fix, videoElement]);

  const pin = targetPin;
  // Always the true GPS distance, and always what gates capture — `ignoreRange`
  // only ever affects where a pin's mesh is *drawn* (see `VIEW_ONLY_RADIUS_M`
  // above); it has never bypassed whether the drop can actually be collected.
  const distance = pin && fix ? distanceMeters(fix, pin) : 0;
  const capturable =
    pin != null && pinStatus(pin) === "collectible" && distance <= AR_CAPTURE_RADIUS;

  // The reusable HUD (radar, edge arrows) wants `Placed[]` — display-only
  // angles derived from where the camera actually is right now, not a second
  // source of truth for where anything gets drawn.
  const placedForHud: Placed[] = fix
    ? [...pinObjectsRef.current.values()].map((obj) => {
        const p = obj.getPin();
        const d = distanceMeters(fix, p);
        const bearing = bearingDegrees(fix, p);
        const offset = angleDelta(heading, bearing);
        return {
          pin: p,
          distance: d,
          offset,
          verticalOffset: 0,
          x: 50,
          y: 50,
          size: 0,
          inView: Math.abs(offset) < 40,
          capturable: pinStatus(p) === "collectible" && d <= AR_CAPTURE_RADIUS,
        };
      })
    : [];
  const offscreen = placedForHud.filter((p) => !p.inView);
  const placedTarget = pin ? placedForHud.find((p) => p.pin.id === pin.id) : null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none overflow-hidden bg-black select-none"
    >
      {/* The camera feed. Layer 0 — the WebGL canvas is appended above it at
          z-10, and every HUD element sits above that again. */}
      {videoEl}

      {/* Atmosphere over the WebGL canvas, matching the old scene's HUD
          contrast treatment exactly. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(3,10,6,0.72)_0%,transparent_26%,transparent_62%,rgba(3,10,6,0.88)_100%)]"
      />

      {offscreen.map((p) => (
        <EdgeArrow key={p.pin.id} placed={p} />
      ))}

      <Reticle locked={Boolean(pin)} armed={capturable} />

      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-4"
        style={{ paddingTop: "calc(var(--ar-top-inset) + 14px)" }}
      >
        <button
          onClick={() => router.back()}
          aria-label="Leave AR"
          className="ar-glass text-ar-dim pointer-events-auto flex h-9 items-center gap-1 rounded-full pr-3 pl-1.5"
        >
          <ChevronLeft size={17} strokeWidth={2.4} />
          <span className="font-hud text-[10px] font-semibold tracking-[0.14em] uppercase">
            Exit
          </span>
        </button>

        {/* Centred on the screen, not between its neighbours — Exit and
            the radar are different widths. */}
        <CameraModeSwitch mode="ar" className="absolute left-1/2 -translate-x-1/2" />

        <ArRadar placed={placedForHud} heading={heading} />
      </div>

      <CompassStrip heading={heading} manual={manual} />

      <div
        className="absolute inset-x-0 bottom-0 z-30 px-5"
        style={{ paddingBottom: "max(20px, var(--ar-safe-bottom))" }}
      >
        <AnimatePresence mode="wait">
          {placedTarget ? (
            /* Just the action. Everything that *describes* the pin — brand,
               title, rarity, distance, why it's locked — is on the card
               hanging beside the coin itself now, so repeating it down here
               would be the same information twice on a small screen. What
               can't move into the world is the button: a canvas sprite has no
               real hit target, no focus ring and nothing for a screen reader,
               so the capture control stays in the DOM. */
            <motion.div
              key={placedTarget.pin.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="mx-auto max-w-[19rem]"
            >
              {capturable ? (
                <CollectButton
                  title={placedTarget.pin.title}
                  onClick={() => onCapture(placedTarget.pin)}
                />
              ) : (
                <ArButton variant="outline" size="lg" block disabled>
                  {pinStatus(placedTarget.pin) === "collected"
                    ? "Already in your collection"
                    : pinStatus(placedTarget.pin) === "expired"
                      ? "This drop has expired"
                      : pinStatus(placedTarget.pin) === "depleted"
                        ? "All claimed"
                        : placedTarget.pin.locked
                          ? "Locked"
                          : "Walk closer to capture"}
                </ArButton>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="hint"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="ar-glass rounded-ar mx-auto max-w-[19rem] px-4 py-3 text-center"
            >
              <p className="font-hud text-ar-green text-[11px] font-semibold tracking-[0.14em] uppercase">
                {pinObjectsRef.current.size === 0
                  ? "Nothing in range"
                  : `${pinObjectsRef.current.size} drop${pinObjectsRef.current.size === 1 ? "" : "s"} around you`}
              </p>
              <p className="text-ar-dim mt-1 text-[11.5px] leading-relaxed">
                {pinObjectsRef.current.size === 0
                  ? `Walk within ${AR_CAPTURE_RADIUS} m of a pin and it'll appear here.`
                  : "Turn until a pin sits in the crosshair."}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Keeps `viewport` a real dependency rather than an unused warning —
          reserved for any HUD element that ends up needing the canvas's own
          measured size rather than the window's. */}
      <span className="sr-only">
        {viewport.w}×{viewport.h}
      </span>
    </div>
  );
}

function findPinId(object: THREE.Object3D | undefined): string | null {
  if (!object) return null;
  const id = object.userData?.pinId as string | undefined;
  return id ?? null;
}
