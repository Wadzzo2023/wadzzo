import { useCallback, useEffect, useRef, useState } from "react";

export type CameraState = "idle" | "starting" | "ready" | "denied" | "unsupported";

/**
 * ── useCamera ──────────────────────────────────────────────────────────────
 *
 * The rear-facing video feed the AR scene is composited over.
 *
 * The awkward part of this hook is ordering. `getUserMedia` has to be called
 * from a user gesture — the permission gate's button — but the `<video>` it
 * feeds only exists once the gate steps aside and the scene mounts. So the
 * stream is always acquired *before* its element exists, and a plain
 * `videoRef.current` check at acquisition time is guaranteed to find null.
 *
 * `attachVideo` is therefore a callback ref, not a plain one: whenever React
 * hands it the element, it wires up whatever stream is already open. That
 * makes the two events order-independent.
 *
 * `facingMode` is an `ideal` rather than an `exact` constraint. On a laptop
 * there is no environment camera, and `exact` would reject outright instead
 * of falling back to the one camera that exists — reviewing the AR HUD on a
 * desktop matters more than refusing to run there.
 *
 * The stream is stopped on unmount. A `getUserMedia` track left running keeps
 * the camera indicator lit after the user has navigated away, which reads as
 * the app spying on them.
 */
export function useCamera({ enabled }: { enabled: boolean }) {
  const nodeRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("idle");
  /**
   * True only once the element is actually rendering frames. `ready` means a
   * stream was granted; this means pixels are on screen. The scene keys its
   * fallback backdrop off this, so a stream that was granted but never
   * attached or never played can't leave the viewer staring at black.
   */
  const [playing, setPlaying] = useState(false);
  /**
   * The live node itself, not just a ref to it. `ArSceneWebGL` needs the real
   * `HTMLVideoElement` — to build a `THREE.VideoTexture` from, and to read
   * `videoWidth`/`videoHeight`, which is what the virtual camera's field of
   * view is derived from. A ref can't serve that: nothing re-renders the
   * parent when a callback ref fires, so the scene would never learn the node
   * exists. State does.
   */
  const [node, setNode] = useState<HTMLVideoElement | null>(null);

  /** Point the element at the open stream and get it running. Idempotent. */
  const wire = useCallback((node: HTMLVideoElement, stream: MediaStream) => {
    if (node.srcObject === stream) return;
    node.srcObject = stream;
    // iOS Safari refuses to autoplay an inline video without both of these,
    // and a paused feed looks identical to a broken one.
    node.muted = true;
    node.playsInline = true;
    void node.play().catch(() => undefined);
  }, []);

  const attachVideo = useCallback(
    (node: HTMLVideoElement | null) => {
      nodeRef.current = node;
      setNode(node);
      if (!node) {
        setPlaying(false);
        return;
      }
      // `playing` fires on every resume, `emptied` when the source is torn
      // down — together they keep the flag honest without polling.
      node.addEventListener("playing", () => setPlaying(true));
      node.addEventListener("emptied", () => setPlaying(false));
      if (streamRef.current) wire(node, streamRef.current);
    },
    [wire],
  );

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (nodeRef.current) nodeRef.current.srcObject = null;
    setPlaying(false);
  }, []);

  const start = useCallback(async () => {
    // The `prefer-optional-chain` rule suggests `navigator?.x` here, which does
    // NOT work: optional chaining guards null/undefined *values*, not undeclared
    // identifiers. `navigator` is genuinely absent as a global during Next.js
    // SSR, where `navigator?.x` still throws a ReferenceError. The `typeof`
    // check is the only safe form, so the rule is suppressed rather than obeyed.
    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return false;
    }
    if (streamRef.current) return true;

    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      // Usually null here — the scene hasn't mounted yet. `attachVideo` picks
      // it up when it does.
      if (nodeRef.current) wire(nodeRef.current, stream);
      setState("ready");
      return true;
    } catch (err) {
      const name = (err as DOMException)?.name;
      setState(
        name === "NotAllowedError" || name === "SecurityError"
          ? "denied"
          : "unsupported",
      );
      return false;
    }
  }, [wire]);

  useEffect(() => {
    if (!enabled) {
      stop();
      setState("idle");
    }
  }, [enabled, stop]);

  useEffect(() => stop, [stop]);

  return {
    /** Callback ref — put this on the `<video>`. */
    attachVideo,
    state,
    start,
    stop,
    /** Permission granted and a stream is open. */
    isReady: state === "ready",
    /** Frames are actually reaching the screen. */
    isPlaying: playing,
    /** The live `<video>` node, once `attachVideo` has run. */
    videoNode: node,
  };
}
