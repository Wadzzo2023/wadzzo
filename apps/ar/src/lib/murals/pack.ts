import { create } from "zustand";
import { AppError, ErrorCodes } from "@wadzzo/errors";
import { platformBranding } from "@wadzzo/platform/branding";

/**
 * ── Mural pack ─────────────────────────────────────────────────────────────
 *
 * The on-device mural finder (MobileCLIP S0 vision, fp16 ONNX, ~22.9 MB) as a
 * game-style "resource pack" (docs/murals/plan.md, 2026-10-05 round):
 *
 *  - starts by itself when the app opens, on any network, and can't be
 *    cancelled — but never blocks anything except Murals capture;
 *  - downloads in 1 MB ranges into IndexedDB, so closing the tab and coming
 *    back RESUMES from the last finished chunk;
 *  - verifies SHA-256 against the manifest before it counts as ready, and
 *    again whenever the Murals camera opens;
 *  - stores the verified file in the exact Cache Storage slot Transformers.js
 *    reads (`transformers-cache`, keyed by the Hugging Face URL), so the
 *    detector loads it with no second download.
 *
 * Source of truth for version/size/hash: `murals/models/manifest.json` on S3.
 */

const MANIFEST_URL = "https://wadzzo.s3.amazonaws.com/murals/models/manifest.json";
const TJS_CACHE = "transformers-cache";
const CHUNK = 1024 * 1024;
const DB_NAME = "wadzzo-mural-pack";
const STORE = "chunks";
const READY_KEY = "wadzzo.muralPack.ready";
/** Seconds between automatic retries after a network failure. */
const RETRY_S = 8;

export type PackFile = {
  url: string;
  bytes: number;
  sha256: string;
  cacheKey: string;
};
type Manifest = { name: string; version: number; web: PackFile };

export type PackStatus = "idle" | "checking" | "downloading" | "verifying" | "ready" | "error";
export type PackErrorCode = "offline" | "network" | "storage" | "damaged" | "unsupported";

export type PackState = {
  status: PackStatus;
  version: number | null;
  totalBytes: number;
  receivedBytes: number;
  /** Smoothed download speed, bytes/s. */
  speed: number;
  error: { code: PackErrorCode; message: string } | null;
  /** Seconds until the next automatic retry, while in error. */
  retryIn: number | null;
  /** Bumped when a download finishes this session (for the toast + chime). */
  justFinished: number;
};

export const useMuralPack = create<PackState>()(() => ({
  status: "idle",
  version: null,
  totalBytes: 0,
  receivedBytes: 0,
  speed: 0,
  error: null,
  retryIn: null,
  justFinished: 0,
}));

const set = (p: Partial<PackState>) => useMuralPack.setState(p);

export const packProgress = (s: Pick<PackState, "receivedBytes" | "totalBytes">) =>
  s.totalBytes ? Math.min(1, s.receivedBytes / s.totalBytes) : 0;

// ── IndexedDB (tiny wrapper — no dependency) ────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
  });
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const r = run(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });
}

const chunkKey = (sha: string, i: number) => `${sha}:${i}`;

async function storedChunks(db: IDBDatabase, sha: string): Promise<Set<number>> {
  const keys = (await tx(db, "readonly", (s) => s.getAllKeys())) as string[];
  return new Set(keys.filter((k) => k.startsWith(`${sha}:`)).map((k) => Number(k.split(":")[1])));
}

async function clearChunks(db: IDBDatabase) {
  await tx(db, "readwrite", (s) => s.clear());
}

// ── Hashing / cache ─────────────────────────────────────────────────────────

async function sha256Hex(buf: ArrayBuffer) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

function readReadyFlag(): { version: number; sha256: string } | null {
  try {
    const raw = localStorage.getItem(READY_KEY);
    return raw ? (JSON.parse(raw) as { version: number; sha256: string }) : null;
  } catch {
    return null;
  }
}
function writeReadyFlag(v: { version: number; sha256: string } | null) {
  try {
    if (v) localStorage.setItem(READY_KEY, JSON.stringify(v));
    else localStorage.removeItem(READY_KEY);
  } catch {
    // Private mode: we'll just re-verify from Cache Storage next time.
  }
}

async function fetchManifest(): Promise<Manifest> {
  const res = await fetch(MANIFEST_URL, { cache: "no-store" });
  if (!res.ok)
    throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
      message: `manifest ${res.status}`,
    });
  return (await res.json()) as Manifest;
}

// ── Engine ──────────────────────────────────────────────────────────────────

let running: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setInterval> | null = null;
let manifestCache: Manifest | null = null;

const supported = () =>
  typeof window !== "undefined" &&
  "caches" in window &&
  "indexedDB" in window &&
  Boolean(globalThis.crypto?.subtle);

function scheduleRetry() {
  if (retryTimer) clearInterval(retryTimer);
  let left = RETRY_S;
  set({ retryIn: left });
  retryTimer = setInterval(() => {
    left -= 1;
    if (left > 0) return set({ retryIn: left });
    if (retryTimer) clearInterval(retryTimer);
    retryTimer = null;
    set({ retryIn: null });
    void startMuralPack();
  }, 1000);
}

function fail(code: PackErrorCode, message: string, retry = true) {
  set({ status: "error", error: { code, message }, speed: 0 });
  if (retry) scheduleRetry();
}

async function run() {
  if (!supported()) {
    fail("unsupported", "This browser can't store the mural pack. Try Chrome or Safari.", false);
    return;
  }
  set({ status: "checking", error: null, retryIn: null });

  // 1. What should be on this device?
  let manifest: Manifest;
  try {
    manifest = manifestCache ?? (await fetchManifest());
    manifestCache = manifest;
  } catch {
    // Offline but already installed? Then it's still ready.
    const flag = readReadyFlag();
    const cache = await caches.open(TJS_CACHE);
    if (flag && navigator.onLine === false && (await cache.match(flagKeyFallback()))) {
      set({ status: "ready", version: flag.version });
      return;
    }
    fail(
      navigator.onLine === false ? "offline" : "network",
      navigator.onLine === false
        ? "You're offline — the download continues when you're back online."
        : `Couldn't reach ${platformBranding.name} to check the mural pack.`,
    );
    return;
  }
  const file = manifest.web;
  set({ version: manifest.version, totalBytes: file.bytes });

  // 2. Already installed and verified for this version?
  const cache = await caches.open(TJS_CACHE);
  const flag = readReadyFlag();
  if (flag?.sha256 === file.sha256 && (await cache.match(file.cacheKey))) {
    set({ status: "ready", receivedBytes: file.bytes, speed: 0 });
    return;
  }

  // 3. Download the missing 1 MB chunks (resumes after a reload).
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    fail(
      "storage",
      "Your browser blocked storage for this site, so the pack can't be saved.",
      false,
    );
    return;
  }
  const count = Math.ceil(file.bytes / CHUNK);
  const have = await storedChunks(db, file.sha256);
  let received = [...have].reduce((n, i) => n + Math.min(CHUNK, file.bytes - i * CHUNK), 0);
  set({ status: "downloading", receivedBytes: received });

  let speed = 0;
  for (let i = 0; i < count; i++) {
    if (have.has(i)) continue;
    const from = i * CHUNK;
    const to = Math.min(file.bytes, from + CHUNK) - 1;
    let buf: ArrayBuffer;
    try {
      const res = await fetch(file.url, {
        headers: { Range: `bytes=${from}-${to}` },
        cache: "no-store",
      });
      if (res.status !== 206 && res.status !== 200)
        throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
          message: `HTTP ${res.status}`,
        });
      if (res.status === 200 || !res.body) {
        // A server that ignored Range sent the whole file — take our slice.
        buf = await res.arrayBuffer();
        if (res.status === 200) buf = buf.slice(from, to + 1);
      } else {
        // Stream the chunk so the bar, speed and ETA move continuously even
        // on a slow connection (a whole 1 MB can take 30 s on bad mobile data).
        const reader = res.body.getReader();
        const parts: Uint8Array[] = [];
        let got = 0;
        let lastT = performance.now();
        let lastGot = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
          got += value.byteLength;
          const now = performance.now();
          if (now - lastT > 200) {
            const inst = ((got - lastGot) * 1000) / (now - lastT);
            speed = speed ? speed * 0.8 + inst * 0.2 : inst;
            lastT = now;
            lastGot = got;
            set({ receivedBytes: received + got, speed });
          }
        }
        const joined = new Uint8Array(got);
        let o = 0;
        for (const part of parts) {
          joined.set(part, o);
          o += part.byteLength;
        }
        buf = joined.buffer;
      }
      if (buf.byteLength !== to - from + 1)
        throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
          message: "short read",
        });
    } catch {
      fail(
        navigator.onLine === false ? "offline" : "network",
        navigator.onLine === false
          ? "You're offline — the download continues when you're back online."
          : "The connection dropped. Retrying…",
      );
      return;
    }
    try {
      await tx(db, "readwrite", (s) => s.put(buf, chunkKey(file.sha256, i)));
    } catch {
      fail("storage", "Not enough storage space for the mural pack (≈23 MB).", false);
      return;
    }
    received += buf.byteLength;
    set({ receivedBytes: received });
  }

  // 4. Assemble + verify.
  set({ status: "verifying", speed: 0 });
  const parts: ArrayBuffer[] = [];
  for (let i = 0; i < count; i++) {
    const part = (await tx(db, "readonly", (s) => s.get(chunkKey(file.sha256, i)))) as
      ArrayBuffer | undefined;
    if (!part) {
      fail("damaged", "Part of the pack went missing. Downloading it again…");
      return;
    }
    parts.push(part);
  }
  const blob = new Blob(parts, { type: "application/octet-stream" });
  const hash = await sha256Hex(await blob.arrayBuffer());
  if (hash !== file.sha256) {
    await clearChunks(db);
    set({ receivedBytes: 0 });
    fail("damaged", "The download was damaged. Starting it again…");
    return;
  }

  // 5. Install where Transformers.js looks, then drop the chunks.
  try {
    await cache.put(
      file.cacheKey,
      new Response(blob, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(file.bytes),
        },
      }),
    );
  } catch {
    fail("storage", "Not enough storage space for the mural pack (≈23 MB).", false);
    return;
  }
  writeReadyFlag({ version: manifest.version, sha256: file.sha256 });
  await clearChunks(db);
  set({
    status: "ready",
    receivedBytes: file.bytes,
    speed: 0,
    justFinished: Date.now(),
  });
}

/** Fallback cache key when the manifest can't be fetched (offline). */
function flagKeyFallback() {
  return "https://huggingface.co/Xenova/mobileclip_s0/resolve/main/onnx/vision_model_fp16.onnx";
}

/** Start (or join) the background install. Safe to call any number of times. */
export function startMuralPack(): Promise<void> {
  if (running) return running;
  running = run()
    .catch(() => fail("network", "Something went wrong with the mural pack. Retrying…"))
    .finally(() => {
      running = null;
    });
  return running;
}

/**
 * Re-hash the installed file. Used before the Murals camera can capture and
 * by Settings › Verify now. A mismatch removes it and starts a fresh download.
 */
export async function verifyMuralPack(): Promise<"ok" | "missing" | "damaged"> {
  if (!supported()) return "missing";
  const manifest = manifestCache ?? (await fetchManifest().catch(() => null));
  const key = manifest?.web.cacheKey ?? flagKeyFallback();
  const cache = await caches.open(TJS_CACHE);
  const res = await cache.match(key);
  if (!res) {
    writeReadyFlag(null);
    if (useMuralPack.getState().status === "ready") set({ status: "idle", receivedBytes: 0 });
    void startMuralPack();
    return "missing";
  }
  set({ status: "verifying" });
  const hash = await sha256Hex(await res.arrayBuffer());
  const expected = manifest?.web.sha256 ?? readReadyFlag()?.sha256;
  if (expected && hash !== expected) {
    await cache.delete(key);
    writeReadyFlag(null);
    set({ receivedBytes: 0 });
    fail("damaged", "The mural pack was damaged. Downloading a fresh copy…");
    return "damaged";
  }
  set({ status: "ready", error: null });
  return "ok";
}

/** Settings › Delete pack. It comes back on the next app open. */
export async function deleteMuralPack() {
  if (!supported()) return;
  const cache = await caches.open(TJS_CACHE);
  await cache.delete(manifestCache?.web.cacheKey ?? flagKeyFallback());
  writeReadyFlag(null);
  await openDb()
    .then(clearChunks)
    .catch(() => undefined);
  set({ status: "idle", receivedBytes: 0, speed: 0, error: null });
}

export function formatBytes(n: number) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(0, Math.round(n / 1e3))} KB`;
}

/** Whether the game-style pack panel is open (opened from the AR-button ring). */
export const usePackSheet = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>()((setState) => ({
  open: false,
  setOpen: (open) => setState({ open }),
}));
