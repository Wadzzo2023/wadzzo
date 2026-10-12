/**
 * Port of the web's `pinIdFromScan` (wadzzoAR/src/lib/ar/useQrScanner.ts):
 * accepts the full URL a printed code encodes (`https://…/scan?pin=<id>`),
 * a card URL (`/collection/<id>`), or a bare id — nothing else, so arbitrary
 * scanned text is never posted to the server. Parsed by hand: React Native's
 * `URL` has patchy `searchParams` support.
 */
export function pinIdFromScan(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const url = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*([^?#]*)(\?[^#]*)?/i.exec(trimmed);
  if (url) {
    const path = url[1] ?? "";
    const query = (url[2] ?? "").replace(/^\?/, "");
    for (const pair of query.split("&")) {
      const [k, v] = pair.split("=");
      if ((k === "pin" || k === "pinId") && v) return decodeURIComponent(v);
    }
    const parts = path.split("/").filter(Boolean);
    if (parts[0] === "collection" && parts[1]) return decodeURIComponent(parts[1]);
    return null;
  }
  return /^[a-z0-9]{16,40}$/i.test(trimmed) ? trimmed : null;
}
