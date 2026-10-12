"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useCamera } from "~/lib/ar/useCamera";
import PROMPTS from "~/lib/murals/prompts.s0.json";

/**
 * ── /dev/mural-spike ───────────────────────────────────────────────────────
 *
 * M0 spike for docs/murals/plan.md §3.1 — not a product screen. Answers:
 * how fast MobileCLIP S0 runs in a real phone browser (WebGPU vs WASM), how
 * big the first download is, whether the score separates murals from
 * everything else in the street, and whether the gyro sweep reads cleanly.
 *
 * Transformers.js is imported from the CDN at runtime so the spike adds no
 * dependency or bundler config; the real build will bundle it.
 * 404s in production.
 */

const TJS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";
const MODEL = "Xenova/mobileclip_s0";
const LOCK_AT = 0.5;
const SWEEP_DEG = 15;

type Backend = "webgpu" | "wasm";

/** The slice of Transformers.js the spike touches (it's loaded untyped from the CDN). */
type Progress = { status: string; file?: string; loaded?: number };
type Embeds = { image_embeds: { normalize(): { tolist(): number[][] } } };
type Tjs = {
  AutoProcessor: {
    from_pretrained(id: string, o: object): Promise<(img: unknown) => Promise<object>>;
  };
  CLIPVisionModelWithProjection: {
    from_pretrained(id: string, o: object): Promise<(inputs: object) => Promise<Embeds>>;
  };
  RawImage: { fromCanvas(c: HTMLCanvasElement): unknown };
};
type Stats = {
  backend?: Backend;
  loadMs?: number;
  downloadedMB?: number;
  encodeMs?: number;
  fps?: number;
  score?: number;
  top?: string;
};

const POS = PROMPTS.positive.length;
const LABELS = [...PROMPTS.positive, ...PROMPTS.negative];
const TEXT = PROMPTS.embeddings;

function scoreOf(v: number[]) {
  const logits = TEXT.map((t) => 100 * t.reduce((s, x, i) => s + x * v[i]!, 0));
  const max = Math.max(...logits);
  const exp = logits.map((l) => Math.exp(l - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  const p = exp.map((e) => e / sum);
  return {
    score: p.slice(0, POS).reduce((a, b) => a + b, 0),
    top: LABELS[p.indexOf(Math.max(...p))]!,
  };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1] ?? 0;
};

export function MuralSpike() {
  const camera = useCamera({ enabled: true });
  const [phase, setPhase] = useState<"idle" | "loading" | "running" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [forceWasm, setForceWasm] = useState(false);
  const [targetFps, setTargetFps] = useState(4);
  const [stats, setStats] = useState<Stats>({});
  const [loadPct, setLoadPct] = useState(0);
  const [locked, setLocked] = useState(false);
  const [yaw, setYaw] = useState<number | null>(null);
  const [sweep, setSweep] = useState({ left: false, right: false });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runRef = useRef(false);
  const fpsRef = useRef(targetFps);
  fpsRef.current = targetFps;
  const lockYaw = useRef<number | null>(null);

  // Gyro: alpha is compass-ish yaw. Only the delta from the lock moment matters.
  useEffect(() => {
    const on = (e: DeviceOrientationEvent) => e.alpha != null && setYaw(e.alpha);
    window.addEventListener("deviceorientation", on);
    return () => window.removeEventListener("deviceorientation", on);
  }, []);

  const yawDelta = (() => {
    if (yaw == null || lockYaw.current == null) return null;
    let d = yaw - lockYaw.current;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  })();

  useEffect(() => {
    if (yawDelta == null) return;
    if (yawDelta >= SWEEP_DEG) setSweep((s) => ({ ...s, left: true }));
    if (yawDelta <= -SWEEP_DEG) setSweep((s) => ({ ...s, right: true }));
  }, [yawDelta]);

  const start = useCallback(async () => {
    if (runRef.current) return;
    setError(null);
    setLoadPct(0);
    setPhase("loading");
    try {
      // iOS needs both of these from the tap.
      const Ctor = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<string>;
      };
      if (typeof Ctor.requestPermission === "function")
        await Ctor.requestPermission().catch(() => null);
      await camera.start();

      const tjs = (await import(/* webpackIgnore: true */ TJS)) as Tjs;
      const backend: Backend =
        !forceWasm &&
        "gpu" in navigator &&
        (await (
          navigator as unknown as {
            gpu: { requestAdapter(): Promise<unknown> };
          }
        ).gpu.requestAdapter())
          ? "webgpu"
          : "wasm";

      const bytes: Record<string, number> = {};
      const progress_callback = (p: Progress) => {
        if (p.status === "progress" && p.file) {
          bytes[p.file] = p.loaded ?? 0;
          // fp16 vision weights are ~22.9 MB; good enough for a spike bar.
          setLoadPct(
            Math.min(
              99,
              Math.round((Object.values(bytes).reduce((a, b) => a + b, 0) / 23e6) * 100),
            ),
          );
        }
      };
      const t0 = performance.now();
      const processor = await tjs.AutoProcessor.from_pretrained(MODEL, {
        progress_callback,
      });
      const model = await tjs.CLIPVisionModelWithProjection.from_pretrained(MODEL, {
        dtype: "fp16",
        device: backend,
        progress_callback,
      });
      const loadMs = performance.now() - t0;
      const downloadedMB = Object.values(bytes).reduce((a, b) => a + b, 0) / 1e6;
      setStats({ backend, loadMs, downloadedMB });
      setPhase("running");

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const encodeTimes: number[] = [];
      const frameStamps: number[] = [];
      const recent: boolean[] = [];
      runRef.current = true;

      const tick = async () => {
        if (!runRef.current) return;
        const started = performance.now();
        const video = camera.videoNode;
        if (video?.videoWidth) {
          // Centre square crop, 256px; the processor does the final 256→224.
          const s = Math.min(video.videoWidth, video.videoHeight);
          ctx.drawImage(
            video,
            (video.videoWidth - s) / 2,
            (video.videoHeight - s) / 2,
            s,
            s,
            0,
            0,
            256,
            256,
          );
          const image = tjs.RawImage.fromCanvas(canvas);
          const t = performance.now();
          const { image_embeds } = await model(await processor(image));
          const v = image_embeds.normalize().tolist()[0]!;
          encodeTimes.push(performance.now() - t);
          if (encodeTimes.length > 30) encodeTimes.shift();
          frameStamps.push(performance.now());
          if (frameStamps.length > 10) frameStamps.shift();

          const { score, top } = scoreOf(v);
          recent.push(score >= LOCK_AT);
          if (recent.length > 5) recent.shift();
          const nowLocked = recent.filter(Boolean).length >= 4;
          setLocked((was) => {
            if (nowLocked && !was) {
              lockYaw.current = null;
              setSweep({ left: false, right: false });
              navigator.vibrate?.(30);
            }
            return nowLocked;
          });
          const span =
            frameStamps.length > 1 ? frameStamps[frameStamps.length - 1]! - frameStamps[0]! : 0;
          setStats((st) => ({
            ...st,
            encodeMs: median(encodeTimes),
            fps: span ? ((frameStamps.length - 1) * 1000) / span : undefined,
            score,
            top,
          }));
        }
        const wait = Math.max(0, 1000 / fpsRef.current - (performance.now() - started));
        setTimeout(() => void tick(), wait);
      };
      void tick();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [camera, forceWasm]);

  useEffect(() => () => void (runRef.current = false), []);

  // Anchor the sweep at the first gyro reading after a lock.
  useEffect(() => {
    if (locked && lockYaw.current == null && yaw != null) lockYaw.current = yaw;
    if (!locked) lockYaw.current = null;
  }, [locked, yaw]);

  const pct = Math.round((stats.score ?? 0) * 100);

  return (
    <div className="fixed inset-0 bg-black text-white">
      <video
        ref={camera.attachVideo}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />
      <canvas ref={canvasRef} width={256} height={256} className="hidden" />

      {/* Brackets */}
      <div
        className={`pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[78vw] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-3xl border-4 transition-all duration-300 ${
          locked
            ? "scale-95 border-fuchsia-400 shadow-[0_0_40px_rgba(232,121,249,.6)]"
            : "border-white/40"
        }`}
      />

      <div className="absolute inset-x-3 top-3 space-y-1 rounded-xl bg-black/60 p-3 font-mono text-[11px] leading-tight backdrop-blur-sm">
        <div>
          backend {stats.backend ?? "—"} · load{" "}
          {stats.loadMs ? `${(stats.loadMs / 1000).toFixed(1)}s` : "—"} · dl{" "}
          {stats.downloadedMB?.toFixed(1) ?? "—"} MB
        </div>
        <div>
          encode {stats.encodeMs?.toFixed(0) ?? "—"} ms · loop {stats.fps?.toFixed(1) ?? "—"} fps
          (target {targetFps})
        </div>
        <div>
          score {pct}% · top “{stats.top ?? "—"}”
        </div>
        <div>
          yaw Δ {yawDelta == null ? "—" : `${yawDelta.toFixed(0)}°`} · sweep L{" "}
          {sweep.left ? "✓" : "·"} R {sweep.right ? "✓" : "·"}
        </div>
        <div className="rounded-base h-1.5 overflow-hidden bg-white/20">
          <div className="h-full bg-fuchsia-400 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Scrim so the guidance stays readable over bright scenes. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-linear-to-t from-black/80 via-black/40 to-black/0" />

      <div className="absolute inset-x-3 bottom-6 space-y-3 text-center">
        <div className="text-lg font-semibold drop-shadow-sm">
          {phase === "idle" && "M0 spike — tap Start"}
          {phase === "loading" && `Getting the mural finder ready… ${loadPct}%`}
          {phase === "error" && `Error: ${error}`}
          {phase === "running" &&
            (!locked
              ? "Point at a mural or street art"
              : !sweep.left
                ? "Mural found — slowly turn left"
                : !sweep.right
                  ? "Now turn right"
                  : "Sweep complete ✓")}
        </div>
        {phase === "loading" && (
          <div className="mx-auto h-1.5 w-48 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full bg-fuchsia-400 transition-all"
              style={{ width: `${loadPct}%` }}
            />
          </div>
        )}
        {(phase === "idle" || phase === "error") && (
          <div className="flex items-center justify-center gap-3">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={forceWasm}
                onChange={(e) => setForceWasm(e.target.checked)}
              />{" "}
              force WASM
            </label>
            <button
              onClick={() => void start()}
              className="rounded-full bg-fuchsia-500 px-6 py-3 font-semibold"
            >
              Start
            </button>
          </div>
        )}
        {phase === "running" && (
          <div className="flex justify-center gap-2 text-sm">
            {[2, 4, 8].map((f) => (
              <button
                key={f}
                onClick={() => setTargetFps(f)}
                className={`rounded-full px-3 py-1 ${f === targetFps ? "bg-white text-black" : "bg-white/20"}`}
              >
                {f} fps
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
