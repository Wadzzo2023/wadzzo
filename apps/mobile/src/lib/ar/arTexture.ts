import { useEffect, useMemo, useState } from "react";

import { SERVER_URL } from "~/lib/api/client";
import type { ArPin } from "~/lib/ar/types";

/**
 * ── AR textures ────────────────────────────────────────────────────────────
 *
 * Viro downloads and decodes every coin/card image itself. Pin and brand
 * images are often 1024 px+ originals; decoding ~25 of those at once stalled
 * the AR camera feed. So AR asks wadzzoAR's Next.js image optimizer for a
 * 256 px version (≈13 KB PNG instead of hundreds of KB). The first request
 * for an image takes a few seconds server-side, so the map warms them in the
 * background — by the time you open AR they're cached.
 */
const SIZE = 256; // one of Next's default imageSizes
/**
 * Must be one of the server's `images.qualities` (Next 16 rejects any other
 * with a 400). 75 is Next's default; q=70 used to 400 and crashed AR.
 */
const QUALITY = 75;

export function arTextureUrl(url: string) {
  return `${SERVER_URL}/_next/image?url=${encodeURIComponent(url)}&w=${SIZE}&q=${QUALITY}`;
}

/** A 96 px thumbnail (a default Next size) for small map tiles like cluster billboards. */
export function thumbUrl(url: string) {
  return `${SERVER_URL}/_next/image?url=${encodeURIComponent(url)}&w=96&q=${QUALITY}`;
}

/** The coin face: the brand's image, else the pin's own. */
export function coinImage(pin: ArPin) {
  return pin.brandImageUrl?.trim() || pin.imageUrl;
}

// ── Texture check ───────────────────────────────────────────────────────────
//
// Viro downloads textures itself, synchronously, and crashes the whole app
// (NSInvalidArgumentException in VRTMaterialManager.retrieveImage) when a
// download doesn't decode to an image: a 400 from the resizer, an SVG, a
// dead link. So every texture is fetched here first, and only one that came
// back as a real raster image is ever handed to Viro.

const CHECK_TIMEOUT_MS = 8_000;
const RASTER = /^image\/(png|jpe?g|webp|gif|heic|heif)\b/i;
const checked = new Map<string, boolean>();
const inflight = new Map<string, Promise<boolean>>();

/** Whether `url` downloads as a raster image Viro can decode. Cached per URL. */
export function checkArTexture(url: string): Promise<boolean> {
  const known = checked.get(url);
  if (known != null) return Promise.resolve(known);
  let p = inflight.get(url);
  if (!p) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
    p = fetch(url, { signal: ctrl.signal })
      .then((res) => res.ok && RASTER.test(res.headers.get("content-type") ?? ""))
      .catch(() => false)
      .then((ok) => {
        clearTimeout(timer);
        checked.set(url, ok);
        inflight.delete(url);
        return ok;
      });
    inflight.set(url, p);
  }
  return p;
}

/** Check results so far for `urls`: true = safe, false = don't use, missing = still checking. */
export function useArTextures(urls: string[]): ReadonlyMap<string, boolean> {
  const key = urls.join("\n");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    for (const url of key ? key.split("\n") : []) {
      if (checked.has(url)) continue;
      void checkArTexture(url).then(() => live && setVersion((v) => v + 1));
    }
    return () => {
      live = false;
    };
  }, [key]);
  // A fresh snapshot whenever a check lands, so callers' memos recompute.
  return useMemo(() => {
    const snap = new Map<string, boolean>();
    for (const url of key ? key.split("\n") : []) {
      const ok = checked.get(url);
      if (ok != null) snap.set(url, ok);
    }
    return snap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
}

/** Fire-and-forget: get the server to resize + cache these for AR (and check them). */
export function warmArTextures(pins: ArPin[]) {
  for (const pin of pins) {
    for (const src of [coinImage(pin), pin.imageUrl]) {
      if (src) void checkArTexture(arTextureUrl(src));
    }
  }
}
