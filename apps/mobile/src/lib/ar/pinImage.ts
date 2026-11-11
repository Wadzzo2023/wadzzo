import { useEffect, useState } from "react";
import { Image } from "react-native";

import { thumbUrl } from "./arTexture";

/**
 * ── Map pin images ─────────────────────────────────────────────────────────
 *
 * A map pin is ~42 px, but its image (usually the brand's logo) is often a large original:
 * one dev logo is a 770 KB PNG, shared by most pins on the map. Every pin downloading and
 * decoding that is slow and heavy, so pins use the server's 96 px thumbnail instead (a few
 * KB), as the cluster tiles do.
 *
 * The thumbnail is fetched once per image (all pins with it share the result) through React
 * Native's image cache, which the pin's SVG image then reads from. If the resizer fails (a dev
 * server that isn't running…), the original is used, so a pin never stays blank. Until either
 * is ready the pin shows its coloured shape, as it does while any image loads.
 */
const resolved = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function resolve(url: string): Promise<string> {
  const known = resolved.get(url);
  if (known) return Promise.resolve(known);
  let p = pending.get(url);
  if (!p) {
    const thumb = thumbUrl(url);
    p = Image.prefetch(thumb)
      .then((ok) => (ok ? thumb : url))
      .catch(() => url)
      .then((use) => {
        resolved.set(url, use);
        pending.delete(url);
        return use;
      });
    pending.set(url, p);
  }
  return p;
}

/** The small image to draw inside a map pin for `url` (null while it's being fetched). */
export function usePinImage(url: string | null | undefined): string | null {
  const [, rerender] = useState(0);
  const ready = url ? (resolved.get(url) ?? null) : null;
  useEffect(() => {
    if (!url || resolved.has(url)) return;
    let live = true;
    void resolve(url).then(() => live && rerender((n) => n + 1));
    return () => {
      live = false;
    };
  }, [url]);
  return ready;
}
