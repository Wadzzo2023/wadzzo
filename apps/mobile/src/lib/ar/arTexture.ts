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
const QUALITY = 70;

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

const warmed = new Set<string>();

/** Fire-and-forget: get the server to resize + cache these for AR. */
export function warmArTextures(pins: ArPin[]) {
  for (const pin of pins) {
    for (const src of [coinImage(pin), pin.imageUrl]) {
      if (!src) continue;
      const url = arTextureUrl(src);
      if (warmed.has(url)) continue;
      warmed.add(url);
      fetch(url).catch(() => warmed.delete(url));
    }
  }
}
