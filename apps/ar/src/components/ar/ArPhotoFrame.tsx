import { AlertTriangle, ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

import { ArButton } from "~/components/ui/ArButton";
import type { ModelViewerElement } from "~/types/model-viewer";
import { AppError, ErrorCodes } from "@wadzzo/errors";

/**
 * ── ArPhotoFrame ──────────────────────────────────────────────────────────
 *
 * Viewing a pin you already own doesn't need the GPS/compass discovery
 * engine (`ArSceneWebGL`) at all — there's nothing to walk toward or turn
 * to face, only something to look at. The sibling `bandfan` project solves
 * that case with a completely different, much lighter stack: build a
 * picture-frame `.glb` around the item's art in-browser, then hand it to
 * Google's `<model-viewer>` web component for the *platform's own* AR
 * placement (WebXR hit-test on Android Chrome, Scene Viewer, or iOS Quick
 * Look) — point the camera at a real surface and the frame drops onto it.
 * No location fix, no device-orientation quaternion, no bearing math.
 *
 * `<model-viewer>` normally shows its own inline 3D canvas with a slotted AR
 * button on top of it — this deliberately doesn't use that. The one thing
 * worth showing here is a plain "View in AR" button, same as the GPS scene's
 * own entry point, that jumps straight to the native AR session via
 * `activateAR()`. The element itself still has to exist for that call to
 * work, so it's mounted off-screen rather than not at all.
 */

const FRAME_THICKNESS = 0.07;
const FRAME_DEPTH = 0.04;
const FALLBACK_COLOR = 0x8b5e3c;

const MODEL_VIEWER_SRC =
  "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";

let modelViewerLoading: Promise<void> | null = null;

/** Loads the `<model-viewer>` custom element once per page, however many frames mount. */
function ensureModelViewerLoaded(): Promise<void> {
  if (customElements.get("model-viewer")) return Promise.resolve();
  modelViewerLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = MODEL_VIEWER_SRC;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("model-viewer script failed to load"));
    document.head.appendChild(script);
  });
  return modelViewerLoading;
}

/** Parses a `RARITY_META`-style "H S% L%" body into fractions `setHSL` expects. */
function parseHslBody(hsl: string): [h: number, s: number, l: number] | null {
  const match = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/.exec(
    hsl.trim(),
  );
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return [
    Number(match[1]) / 360,
    Number(match[2]) / 100,
    Number(match[3]) / 100,
  ];
}

/** Builds a beveled picture-frame around `texture` and exports it as a `.glb` blob. */
async function buildFrameGlb(
  texture: THREE.Texture,
  aspectRatio: number,
  frameColor: THREE.Color,
): Promise<Blob> {
  const scene = new THREE.Scene();
  const H = 1;
  const W = H * aspectRatio;
  const T = FRAME_THICKNESS;
  const D = FRAME_DEPTH;

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: frameColor,
    roughness: 0.7,
    metalness: 0.1,
  });

  const addBar = (px: number, py: number, sx: number, sy: number) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, D), frameMaterial);
    bar.position.set(px, py, 0);
    scene.add(bar);
  };
  addBar(0, H / 2 + T / 2, W + T * 2, T);
  addBar(0, -H / 2 - T / 2, W + T * 2, T);
  addBar(-W / 2 - T / 2, 0, T, H);
  addBar(W / 2 + T / 2, 0, T, H);

  const photo = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
    }),
  );
  photo.position.set(0, 0, D / 2 + 0.001);
  scene.add(photo);

  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, {
    binary: true,
    embedImages: true,
    maxTextureSize: 1024,
  });
  if (!(result instanceof ArrayBuffer)) {
    throw new AppError(ErrorCodes.INTERNAL, { message: "GLTFExporter returned JSON, not a binary .glb" });
  }
  return new Blob([result], { type: "model/gltf-binary" });
}

export function ArPhotoFrame({
  imageUrl,
  /** `RARITY_META[rarity].hsl` — ties the frame's wood tone to the pin's rarity. */
  accentHsl,
  className,
}: {
  imageUrl: string;
  accentHsl?: string;
  className?: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const viewerRef = useRef<ModelViewerElement>(null);

  useEffect(() => {
    void ensureModelViewerLoaded();
  }, []);

  // Builds the frame in the background as soon as there's an image to build
  // it from, so by the time someone actually taps the button it's usually
  // already sitting there ready — no spinner on the critical path.
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setNotice(null);

    const frameColor = new THREE.Color(FALLBACK_COLOR);
    const hslBody = accentHsl ? parseHslBody(accentHsl) : null;
    if (hslBody) frameColor.setHSL(...hslBody);

    const proxiedUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";

    loader
      .loadAsync(proxiedUrl)
      .then((texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        const { width, height } = texture.image as {
          width: number;
          height: number;
        };
        const aspectRatio = width > 0 && height > 0 ? width / height : 1;
        return buildFrameGlb(texture, aspectRatio, frameColor);
      })
      .then((blob) => {
        if (cancelled) return;
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setModelUrl(url);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("ArPhotoFrame: failed to build AR frame:", err);
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [imageUrl, accentHsl, retryKey]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const handleClick = () => {
    if (state === "error") {
      setRetryKey((k) => k + 1);
      return;
    }
    if (state !== "ready") return;
    setNotice(null);
    viewerRef.current?.activateAR().catch(() => {
      setNotice(
        "AR isn't available on this browser — try opening this page on your phone's camera.",
      );
    });
  };

  return (
    <div className={className}>
      <ArButton
        variant="primary"
        size="lg"
        block
        busy={state === "loading"}
        icon={state === "error" ? AlertTriangle : ScanLine}
        onClick={handleClick}
      >
        {state === "error" ? "Try again" : "View in AR"}
      </ArButton>

      {notice && (
        <p className="mt-2 text-center text-[11px] leading-relaxed text-ar-faint">
          {notice}
        </p>
      )}

      {/* Off-screen: `activateAR()` needs the element mounted and loaded,
          but its own inline canvas and slotted AR button are never shown —
          the `ArButton` above is the only visible control. */}
      {modelUrl && (
        <model-viewer
          ref={viewerRef}
          src={modelUrl}
          ar
          ar-modes="webxr scene-viewer quick-look"
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
