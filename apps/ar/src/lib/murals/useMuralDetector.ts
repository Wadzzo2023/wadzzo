import type * as Tjs from "@huggingface/transformers";
import { useCallback, useEffect, useRef, useState } from "react";

import { HOLD_SCORE, LOCK_SCORE } from "./constants";
import { boxFromScores, cropGrid, outlineFor, type Outline } from "./localize";
import { muralScore } from "./score";

/**
 * ── useMuralDetector ───────────────────────────────────────────────────────
 *
 * The on-device half of murals detection (plan §3.1): MobileCLIP S0 fp16 on
 * the live camera, a few frames a second, smoothed into a lock.
 *
 * - WebGPU where the browser has it, WASM otherwise. Both hold 4 fps; WASM
 *   just spends more of each frame encoding (M0: ~25 ms vs ~130 ms).
 * - The model (~23 MB) is fetched once and cached by the browser; `progress`
 *   drives the first-run card.
 * - Lock = 4 of the last 5 frames ≥ LOCK_SCORE. Once locked it holds until 3
 *   in a row fall under HOLD_SCORE, so a passer-by doesn't break a sweep.
 * - Cheap quality checks (too dark / blurry) run on the same 64 px thumbnail
 *   and are reported, not enforced — the guidance text decides what to say.
 *
 * Only the vision encoder runs here; the prompt side is precomputed
 * (`prompts.s0.json`), the same file the server scores with.
 */

const MODEL = "Xenova/mobileclip_s0";
/** Approximate bytes of the fp16 vision weights + configs, for the progress bar. */
const MODEL_BYTES = 23e6;
const FPS = 4;

export type DetectorState = "idle" | "loading" | "ready" | "error";
export type ArtKind = "Mural" | "Graffiti" | "Street art";

/** How often the outline is re-fitted while something art-like is in view. */
const LOCATE_MS = 550;
/** Lose the outline after this many misses in a row. */
const OUTLINE_MISSES = 3;

const kindOf = (label: string): ArtKind =>
  label.includes("graffiti")
    ? "Graffiti"
    : label.includes("mural") || label.includes("wall painting") || label.includes("facade")
      ? "Mural"
      : "Street art";
export type FrameQuality = "ok" | "dark" | "blurry";

type Vision = {
  processor: (img: Tjs.RawImage) => Promise<Record<string, unknown>>;
  model: (inputs: Record<string, unknown>) => Promise<{ image_embeds: Tjs.Tensor }>;
  RawImage: typeof Tjs.RawImage;
  backend: "webgpu" | "wasm";
};

let shared: Promise<Vision> | null = null;
const listeners = new Set<(pct: number) => void>();

async function hasWebGpu() {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return Boolean(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

/** One model per page load, however many times the camera mounts. */
function loadModel(): Promise<Vision> {
  if (shared) return shared;
  const loading = (async (): Promise<Vision> => {
    const tjs = await import("@huggingface/transformers");
    const backend: Vision["backend"] = (await hasWebGpu()) ? "webgpu" : "wasm";
    const bytes: Record<string, number> = {};
    const progress_callback = (p: { status: string; file?: string; loaded?: number }) => {
      if (p.status !== "progress" || !p.file) return;
      bytes[p.file] = p.loaded ?? 0;
      const pct = Math.min(
        99,
        Math.round((Object.values(bytes).reduce((a, b) => a + b, 0) / MODEL_BYTES) * 100),
      );
      listeners.forEach((l) => l(pct));
    };
    const [processor, model] = await Promise.all([
      tjs.AutoProcessor.from_pretrained(MODEL, { progress_callback }),
      tjs.CLIPVisionModelWithProjection.from_pretrained(MODEL, {
        dtype: "fp16",
        device: backend,
        progress_callback,
      }),
    ]);
    listeners.forEach((l) => l(100));
    return {
      processor: processor as unknown as Vision["processor"],
      model: model as unknown as Vision["model"],
      RawImage: tjs.RawImage,
      backend,
    };
  })().catch((e: unknown) => {
    shared = null;
    throw e;
  });
  shared = loading;
  return loading;
}

/** Mean luma and a cheap sharpness score from a small grayscale thumbnail. */
function measureQuality(ctx: CanvasRenderingContext2D, size: number): FrameQuality {
  const { data } = ctx.getImageData(0, 0, size, size);
  const g = new Float32Array(size * size);
  let sum = 0;
  for (let i = 0; i < g.length; i++) {
    const v = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
    g[i] = v;
    sum += v;
  }
  if (sum / g.length < 38) return "dark";
  // Variance of a 4-neighbour Laplacian; low = no edges = blur.
  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      const lap = 4 * g[i]! - g[i - 1]! - g[i + 1]! - g[i - size]! - g[i + size]!;
      lapSum += lap;
      lapSq += lap * lap;
      n++;
    }
  }
  const variance = lapSq / n - (lapSum / n) ** 2;
  return variance < 60 ? "blurry" : "ok";
}

export function useMuralDetector({
  video,
  enabled,
}: {
  video: HTMLVideoElement | null;
  enabled: boolean;
}) {
  const [state, setState] = useState<DetectorState>("idle");
  const [progress, setProgress] = useState(0);
  const [backend, setBackend] = useState<Vision["backend"] | null>(null);
  const [score, setScore] = useState(0);
  const [locked, setLocked] = useState(false);
  const [quality, setQuality] = useState<FrameQuality>("ok");
  /** Where the art is, normalised to the full video frame (null = not found). */
  const [outline, setOutline] = useState<Outline | null>(null);
  const [kind, setKind] = useState<ArtKind>("Street art");
  /** videoWidth / videoHeight, for mapping the outline onto the screen. */
  const [frameAspect, setFrameAspect] = useState(9 / 16);

  const vision = useRef<Vision | null>(null);
  const lastVector = useRef<number[] | null>(null);
  const lockedRef = useRef(false);
  const recent = useRef<number[]>([]);
  const encodeCanvas = useRef<HTMLCanvasElement | null>(null);
  const qualityCanvas = useRef<HTMLCanvasElement | null>(null);
  const sampleCanvas = useRef<HTMLCanvasElement | null>(null);
  const lastLocate = useRef(0);
  const misses = useRef(0);

  // Load as soon as the screen wants detection; shared across mounts.
  useEffect(() => {
    if (!enabled || vision.current) return;
    let live = true;
    const onProgress = (pct: number) => live && setProgress(pct);
    listeners.add(onProgress);
    setState("loading");
    loadModel()
      .then((v) => {
        if (!live) return;
        vision.current = v;
        setBackend(v.backend);
        setState("ready");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
      listeners.delete(onProgress);
    };
  }, [enabled]);

  const reset = useCallback(() => {
    recent.current = [];
    lockedRef.current = false;
    setLocked(false);
    setScore(0);
    setOutline(null);
    misses.current = 0;
  }, []);

  // The loop: one frame, encode, then schedule the next so slow devices
  // never queue work.
  useEffect(() => {
    if (!enabled || state !== "ready" || !video) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    encodeCanvas.current ??= Object.assign(document.createElement("canvas"), {
      width: 256,
      height: 256,
    });
    qualityCanvas.current ??= Object.assign(document.createElement("canvas"), {
      width: 64,
      height: 64,
    });
    const ectx = encodeCanvas.current.getContext("2d", {
      willReadFrequently: true,
    })!;
    const qctx = qualityCanvas.current.getContext("2d", {
      willReadFrequently: true,
    })!;
    sampleCanvas.current ??= document.createElement("canvas");
    const sctx = sampleCanvas.current.getContext("2d", {
      willReadFrequently: true,
    })!;

    /** Score the crop grid, fit an outline. ~5–9 extra encodes, ~2×/s. */
    const locate = async (v: Vision) => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const crops = cropGrid(v.backend === "webgpu");
      const scores: number[] = [];
      for (const c of crops) {
        ectx.drawImage(video, c.x * vw, c.y * vh, c.w * vw, c.h * vh, 0, 0, 256, 256);
        const { image_embeds } = await v.model(
          await v.processor(v.RawImage.fromCanvas(encodeCanvas.current!)),
        );
        scores.push(muralScore((image_embeds.normalize().tolist() as number[][])[0]!).score);
        if (stop) return;
      }
      const box = boxFromScores(crops, scores);
      if (!box) {
        if (++misses.current >= OUTLINE_MISSES) setOutline(null);
        return;
      }
      misses.current = 0;
      // 160 px wide RGB sample of the whole frame for the edge/colour pass.
      const sw = 160;
      const sh = Math.max(16, Math.round((160 * vh) / vw));
      sampleCanvas.current!.width = sw;
      sampleCanvas.current!.height = sh;
      sctx.drawImage(video, 0, 0, sw, sh);
      const rgba = sctx.getImageData(0, 0, sw, sh).data;
      const rgb = new Uint8Array(sw * sh * 3);
      for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
        rgb[j] = rgba[i]!;
        rgb[j + 1] = rgba[i + 1]!;
        rgb[j + 2] = rgba[i + 2]!;
      }
      setFrameAspect(vw / vh);
      setOutline(outlineFor({ data: rgb, w: sw, h: sh }, box));
    };

    const tick = async () => {
      if (stop) return;
      const started = performance.now();
      const v = vision.current;
      if (v && video.videoWidth && document.visibilityState === "visible") {
        // Centre square — what the viewfinder brackets frame.
        const s = Math.min(video.videoWidth, video.videoHeight);
        const sx = (video.videoWidth - s) / 2;
        const sy = (video.videoHeight - s) / 2;
        ectx.drawImage(video, sx, sy, s, s, 0, 0, 256, 256);
        qctx.drawImage(encodeCanvas.current!, 0, 0, 64, 64);
        setQuality(measureQuality(qctx, 64));

        try {
          const { image_embeds } = await v.model(
            await v.processor(v.RawImage.fromCanvas(encodeCanvas.current!)),
          );
          const vec = (image_embeds.normalize().tolist() as number[][])[0]!;
          if (stop) return;
          lastVector.current = vec;
          const { score: sc, top } = muralScore(vec);
          setScore(sc);
          if (sc >= 0.25) setKind(kindOf(top));

          const r = recent.current;
          r.push(sc);
          if (r.length > 5) r.shift();
          const wasLocked = lockedRef.current;
          const nowLocked = wasLocked
            ? !(r.length >= 3 && r.slice(-3).every((x) => x < HOLD_SCORE))
            : r.filter((x) => x >= LOCK_SCORE).length >= 4;
          if (nowLocked !== wasLocked) {
            lockedRef.current = nowLocked;
            setLocked(nowLocked);
          }

          const now = performance.now();
          if ((sc >= 0.25 || nowLocked) && now - lastLocate.current > LOCATE_MS) {
            lastLocate.current = now;
            await locate(v);
          } else if (sc < 0.15 && !nowLocked && ++misses.current >= OUTLINE_MISSES) {
            setOutline(null);
          }
        } catch {
          // A dropped frame (GPU context loss, tab switch) is not worth surfacing.
        }
      }
      const wait = Math.max(0, 1000 / FPS - (performance.now() - started));
      timer = setTimeout(() => void tick(), wait);
    };
    void tick();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, state, video]);

  return {
    state,
    /** 0–100 while the model downloads (first visit only). */
    progress,
    backend,
    score,
    locked,
    quality,
    /** The latest frame's embedding — used to pre-match against nearby murals. */
    lastVector,
    outline,
    kind,
    frameAspect,
    reset,
  };
}

/**
 * One keyframe from the live video: full frame, long edge ≤ 1024 px, JPEG.
 * These are what the server re-checks, so they're taken at a decent size,
 * unlike the 256 px detector frames.
 */
export async function captureKeyframe(video: HTMLVideoElement): Promise<Blob> {
  const scale = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = Object.assign(document.createElement("canvas"), {
    width: Math.round(video.videoWidth * scale),
    height: Math.round(video.videoHeight * scale),
  });
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Couldn't capture frame"))),
      "image/jpeg",
      0.8,
    ),
  );
}
