import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import type { TensorflowModel } from "react-native-fast-tflite";
import { useFrameOutput, type Frame } from "react-native-vision-camera";
import { createSynchronizable, scheduleOnRN } from "react-native-worklets";

import { HOLD_SCORE, LOCK_SCORE } from "./constants";
import { boxFromScores, cropGrid, outlineFor, type Outline } from "./localize";
import { loadMuralModel, MODEL_INPUT } from "./model";
import { muralScore } from "./score";

/**
 * ── useMuralDetector ───────────────────────────────────────────────────────
 *
 * Native twin of wadzzoAR's `useMuralDetector` (plan §3.1 + the 2026-10-05
 * outline round). A VisionCamera 5 frame output delivers upright RGB frames;
 * a worklet on the camera thread:
 *
 *   ~4×/s   centre square → 256² → MobileCLIP S0 (TFLite) → score
 *   ~1.6×/s while something art-like is in view: the crop grid (9 on iOS,
 *           5 on Android) is scored the same way, plus a 120 px RGB sample
 *           of the frame — React then fits the outline (quad, else box)
 *           with the shared `localize.ts`.
 *
 * Lock rules match the web: 4 of the last 5 ≥ LOCK_SCORE to lock, 3 in a
 * row < HOLD_SCORE to let go. The model comes only from the verified
 * Mural pack — pass `enabled` once the camera's integrity check passed.
 */

const INTERVAL_MS = 250;
const LOCATE_MS = 600;
const N = MODEL_INPUT;
/** Module-level: `useFrameOutput` memoises on this object's identity. */
const FRAME_SIZE = { width: 480, height: 640 };
const ignoreDrops = () => undefined;
const CROPS = cropGrid(Platform.OS === "ios");
const SAMPLE_W = 120;

export type DetectorState = "idle" | "loading" | "ready" | "error";
export type FrameQuality = "ok" | "dark" | "blurry";
export type ArtKind = "Mural" | "Graffiti" | "Street art";

/** Region (pixels) of the frame → [1,256,256,3] float32 RGB 0–1, 2×2 box filter. */
function sampleInto(buf: Uint8Array, bpr: number, bgra: boolean, w: number, h: number, rx: number, ry: number, rw: number, rh: number, out: Float32Array) {
  "worklet";
  const rOff = bgra ? 2 : 0;
  const bOff = bgra ? 0 : 2;
  const sx = rw / N;
  const sy = rh / N;
  const hx = Math.max(1, Math.floor(sx / 2));
  const hy = Math.max(1, Math.floor(sy / 2));
  let luma = 0;
  for (let y = 0; y < N; y++) {
    const y0 = Math.min(h - 1, Math.floor(ry + y * sy));
    const y1 = Math.min(h - 1, y0 + hy);
    for (let x = 0; x < N; x++) {
      const x0 = Math.min(w - 1, Math.floor(rx + x * sx));
      const x1 = Math.min(w - 1, x0 + hx);
      const a = y0 * bpr + x0 * 4;
      const b = y0 * bpr + x1 * 4;
      const c = y1 * bpr + x0 * 4;
      const d = y1 * bpr + x1 * 4;
      const r = (buf[a + rOff]! + buf[b + rOff]! + buf[c + rOff]! + buf[d + rOff]!) / 1020;
      const g = (buf[a + 1]! + buf[b + 1]! + buf[c + 1]! + buf[d + 1]!) / 1020;
      const bl = (buf[a + bOff]! + buf[b + bOff]! + buf[c + bOff]! + buf[d + bOff]!) / 1020;
      const i = (y * N + x) * 3;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = bl;
      luma += 0.299 * r + 0.587 * g + 0.114 * bl;
    }
  }
  return luma / (N * N);
}

/** Variance of a 4-neighbour Laplacian on a 64×64 subsample — low = blur. */
function sharpness(input: Float32Array) {
  "worklet";
  const S = 64;
  const k = N / S;
  const g = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * k * N + x * k) * 3;
      g[y * S + x] = (0.299 * input[i]! + 0.587 * input[i + 1]! + 0.114 * input[i + 2]!) * 255;
    }
  }
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) {
      const i = y * S + x;
      const lap = 4 * g[i]! - g[i - 1]! - g[i + 1]! - g[i - S]! - g[i + S]!;
      sum += lap;
      sq += lap * lap;
      n++;
    }
  }
  return sq / n - (sum / n) ** 2;
}

function embed(model: TensorflowModel, input: Float32Array) {
  "worklet";
  const [out] = model.runSync([input.buffer as ArrayBuffer]);
  const raw = new Float32Array(out!);
  let norm = 0;
  for (let i = 0; i < raw.length; i++) norm += raw[i]! * raw[i]!;
  norm = Math.sqrt(norm) || 1;
  const vec: number[] = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) vec[i] = raw[i]! / norm;
  return vec;
}

const kindOf = (label: string): ArtKind =>
  label.includes("graffiti") ? "Graffiti" : label.includes("mural") || label.includes("wall painting") || label.includes("facade") ? "Mural" : "Street art";

export function useMuralDetector({ enabled, onLockChange }: { enabled: boolean; onLockChange?: (locked: boolean) => void }) {
  const [model, setModel] = useState<TensorflowModel | null>(null);
  const [failed, setFailed] = useState(false);
  const state: DetectorState = model ? "ready" : failed ? "error" : enabled ? "loading" : "idle";
  const [score, setScore] = useState(0);
  const [locked, setLocked] = useState(false);
  const [quality, setQuality] = useState<FrameQuality>("ok");
  const [kind, setKind] = useState<ArtKind>("Street art");
  const [outline, setOutline] = useState<Outline | null>(null);
  const [frameAspect, setFrameAspect] = useState(3 / 4);

  const lastVector = useRef<number[] | null>(null);
  const recent = useRef<number[]>([]);
  const lockedRef = useRef(false);
  const misses = useRef(0);
  const onLockRef = useRef(onLockChange);
  useEffect(() => {
    onLockRef.current = onLockChange;
  }, [onLockChange]);

  // Shared with the camera thread.
  const lastRun = useMemo(() => createSynchronizable(0), []);
  const lastLocate = useMemo(() => createSynchronizable(0), []);
  const active = useMemo(() => createSynchronizable(false), []);
  const hot = useMemo(() => createSynchronizable(false), []);
  useEffect(() => active.setBlocking(enabled && model != null), [active, enabled, model]);

  useEffect(() => {
    if (!enabled || model) return;
    let live = true;
    loadMuralModel()
      .then((m) => live && setModel(m))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [enabled, model]);

  const onResult = useCallback(
    (sc: number, q: FrameQuality, vec: number[]) => {
      lastVector.current = vec;
      setScore(sc);
      setQuality(q);
      const r = recent.current;
      r.push(sc);
      if (r.length > 5) r.shift();
      const was = lockedRef.current;
      const now = was ? !(r.length >= 3 && r.slice(-3).every((x) => x < HOLD_SCORE)) : r.filter((x) => x >= LOCK_SCORE).length >= 4;
      hot.setBlocking(now || sc >= 0.25);
      if (sc < 0.15 && !now && ++misses.current >= 3) setOutline(null);
      if (now !== was) {
        lockedRef.current = now;
        setLocked(now);
        onLockRef.current?.(now);
      }
    },
    [hot],
  );

  const onLabel = useCallback((label: string) => setKind(kindOf(label)), []);

  const onLocate = useCallback((scores: number[], rgb: number[], sw: number, sh: number, aspect: number) => {
    setFrameAspect(aspect);
    const box = boxFromScores(CROPS, scores);
    if (!box) {
      if (++misses.current >= 3) setOutline(null);
      return;
    }
    misses.current = 0;
    setOutline(outlineFor({ data: Uint8Array.from(rgb), w: sw, h: sh }, box));
  }, []);

  // Memoised: a new function identity re-registers the camera-thread callback.
  const onFrame = useCallback(
    (frame: Frame) => {
      "worklet";
      try {
        if (!active.getDirty() || model == null) return;
        const now = Date.now();
        if (now - lastRun.getDirty() < INTERVAL_MS) return;
        lastRun.setBlocking(now);

        const buf = new Uint8Array(frame.getPixelBuffer());
        const w = frame.width;
        const h = frame.height;
        const bpr = frame.bytesPerRow;
        // iOS delivers BGRA, Android RGBA.
        const bgra = frame.pixelFormat === "rgb-bgra-8-bit";

        // ── Detection: the centre square ───────────────────────────────
        const input = new Float32Array(N * N * 3);
        const s = Math.min(w, h);
        const luma = sampleInto(buf, bpr, bgra, w, h, (w - s) / 2, (h - s) / 2, s, s, input);
        const q: FrameQuality = luma < 0.15 ? "dark" : sharpness(input) < 60 ? "blurry" : "ok";
        const vec = embed(model, input);
        const { score: sc, top } = muralScore(vec);
        scheduleOnRN(onResult, sc, q, vec);
        if (sc >= 0.25) scheduleOnRN(onLabel, top);

        // ── Localisation: crop grid + RGB sample, ~1.6×/s while hot ────
        if ((hot.getDirty() || sc >= 0.25) && now - lastLocate.getDirty() > LOCATE_MS) {
          lastLocate.setBlocking(now);
          const scores: number[] = [];
          for (let i = 0; i < CROPS.length; i++) {
            const c = CROPS[i]!;
            sampleInto(buf, bpr, bgra, w, h, c.x * w, c.y * h, c.w * w, c.h * h, input);
            scores.push(muralScore(embed(model, input)).score);
          }
          const sw = SAMPLE_W;
          const sh = Math.round((SAMPLE_W * h) / w);
          const rgb: number[] = new Array(sw * sh * 3);
          const rOff = bgra ? 2 : 0;
          const bOff = bgra ? 0 : 2;
          for (let y = 0; y < sh; y++) {
            const py = Math.min(h - 1, Math.floor((y * h) / sh));
            for (let x = 0; x < sw; x++) {
              const px = Math.min(w - 1, Math.floor((x * w) / sw));
              const a = py * bpr + px * 4;
              const o = (y * sw + x) * 3;
              rgb[o] = buf[a + rOff]!;
              rgb[o + 1] = buf[a + 1]!;
              rgb[o + 2] = buf[a + bOff]!;
            }
          }
          scheduleOnRN(onLocate, scores, rgb, sw, sh, w / h);
        }
      } finally {
        frame.dispose();
      }
    },
    [active, hot, lastLocate, lastRun, model, onLabel, onLocate, onResult],
  );

  const frameOutput = useFrameOutput({
    targetResolution: FRAME_SIZE,
    pixelFormat: "rgb",
    enablePhysicalBufferRotation: true,
    enablePreviewSizedOutputBuffers: true,
    // Skipped frames (throttle, busy) are expected — don't warn about them.
    dropFramesWhileBusy: true,
    onFrameDropped: ignoreDrops,
    onFrame,
  });

  const reset = useCallback(() => {
    recent.current = [];
    lockedRef.current = false;
    misses.current = 0;
    hot.setBlocking(false);
    setLocked(false);
    setScore(0);
    setOutline(null);
  }, [hot]);

  return { frameOutput, state, score, locked, quality, kind, outline, frameAspect, lastVector, reset };
}
