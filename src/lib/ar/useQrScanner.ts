import { useEffect, useRef } from "react";

/**
 * ── useQrScanner ───────────────────────────────────────────────────────────
 *
 * Reads QR codes off an already-running `<video>` element and calls back with
 * the decoded text. Deliberately does not own the camera: `/scan` already has
 * a working `useCamera` stream and viewfinder, and a second scanner library
 * grabbing its own `getUserMedia` would fight it for the device.
 *
 * Two decoders, in order of preference:
 *
 *  1. `BarcodeDetector`, where the browser has it (Chrome since 2019, Safari
 *     since 17). Native, hardware-accelerated, costs nothing to ship.
 *  2. `jsqr`, dynamically imported only when the native one is missing — so
 *     the ~45 KB never lands on the phones that don't need it, which is most
 *     of them.
 *
 * Scans on a timer rather than per animation frame. Decoding every frame at
 * 60fps is wasted work on a code that takes a moment to line up anyway, and on
 * a phone it is the difference between a warm handset and a hot one.
 */
const SCAN_INTERVAL_MS = 150;

/**
 * Side of the square the decoder actually looks at, in pixels.
 *
 * The frame off a phone camera is 1080p or better — roughly two million
 * pixels. Handing that to a software decoder on the main thread, several times
 * a second, is enough to stall rendering, and the symptom is a preview that
 * visibly stutters while the decode runs. A QR only needs its modules to be a
 * few pixels each, so the frame is scaled down to this before it is read. The
 * cost drops by roughly thirty times and nothing is lost.
 */
const DECODE_SIZE_PX = 384;

/**
 * How much of the frame to read, as a fraction of its short edge.
 *
 * Cropped to the middle rather than scanning the whole frame, because that is
 * where the viewfinder on `/scan` tells people to put the code — reading the
 * edges would spend most of the budget on pixels the UI has already told the
 * user not to use.
 */
const CROP_FRACTION = 0.72;

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

export function useQrScanner({
  video,
  enabled,
  onResult,
}: {
  video: HTMLVideoElement | null;
  enabled: boolean;
  /** Called with the decoded text. Fires repeatedly — the caller de-dupes. */
  onResult: (text: string) => void;
}) {
  // Held in a ref so changing the handler doesn't tear down and restart the
  // decode loop mid-scan.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (!enabled || !video) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let detector: BarcodeDetectorLike | null = null;
    let decodeFallback: ((d: ImageData) => { data: string } | null) | null =
      null;
    const canvas = document.createElement("canvas");

    const setup = async () => {
      const Ctor = (
        window as unknown as {
          BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike;
        }
      ).BarcodeDetector;

      if (Ctor) {
        try {
          detector = new Ctor({ formats: ["qr_code"] });
          return;
        } catch {
          // Constructed but unsupported format — fall through to jsqr.
        }
      }
      const mod = await import("jsqr");
      decodeFallback = (d) => mod.default(d.data, d.width, d.height);
    };

    // Sized once. Reassigning width/height reallocates and clears the backing
    // store, which is wasted work on every single frame.
    canvas.width = DECODE_SIZE_PX;
    canvas.height = DECODE_SIZE_PX;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    /** Centre-crop the frame and scale it into the fixed decode canvas. */
    const grabFrame = () => {
      if (!ctx || !video) return false;
      const side = Math.min(video.videoWidth, video.videoHeight) * CROP_FRACTION;
      const sx = (video.videoWidth - side) / 2;
      const sy = (video.videoHeight - side) / 2;
      ctx.drawImage(
        video,
        sx,
        sy,
        side,
        side,
        0,
        0,
        DECODE_SIZE_PX,
        DECODE_SIZE_PX,
      );
      return true;
    };

    const tick = async () => {
      if (stopped || !video) return;

      // `readyState < 2` means no frame is decodable yet; drawing it would
      // give the decoder a blank canvas and a guaranteed miss.
      if (video.readyState >= 2 && video.videoWidth > 0 && grabFrame()) {
        try {
          // Both decoders read the same cropped, downscaled canvas. Handing
          // the native one the raw <video> would be marginally faster, but
          // then a code near the frame edge would scan on one device and not
          // on another — worse than the microseconds it saves.
          if (detector) {
            const hits = await detector.detect(canvas);
            const first = hits[0];
            if (first?.rawValue) onResultRef.current(first.rawValue);
          } else if (decodeFallback && ctx) {
            const frame = ctx.getImageData(0, 0, DECODE_SIZE_PX, DECODE_SIZE_PX);
            const hit = decodeFallback(frame);
            if (hit?.data) onResultRef.current(hit.data);
          }
        } catch {
          // A single failed frame is not worth surfacing — the next one is
          // moments away, and the usual cause is the camera mid-reconfigure.
        }
      }

      if (!stopped) timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS);
    };

    void setup().then(() => {
      if (!stopped) void tick();
    });

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [video, enabled]);
}

/**
 * Pull a pin id out of whatever the camera just read.
 *
 * Accepts the full URL the QR encodes (`https://…/scan?pin=<id>`), because
 * that is what a phone's own camera app needs in order to deep-link into the
 * app rather than showing the user a meaningless string. A bare id is accepted
 * too, so a code generated elsewhere still works.
 *
 * Returns null for anything else — a Wi-Fi code, a business card, another
 * app's QR — so the scanner can say "not a Wadzzo code" instead of firing a
 * request that was never going to succeed.
 */
export function pinIdFromScan(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const fromQuery = url.searchParams.get("pin") ?? url.searchParams.get("pinId");
    if (fromQuery) return fromQuery;

    // `/collection/<id>` — the card's own page, which is what someone is most
    // likely to have copied and turned into a code by hand.
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "collection" && parts[1]) return parts[1];
    return null;
  } catch {
    // Not a URL. Accept a bare id, but only if it looks like one — cuid-ish,
    // no spaces — rather than posting arbitrary scanned text to the server.
    return /^[a-z0-9]{16,40}$/i.test(trimmed) ? trimmed : null;
  }
}
