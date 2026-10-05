import tzLookup from "@photostructure/tz-lookup";

import { env } from "~/env";

/**
 * ── Murals: place and time ─────────────────────────────────────────────────
 *
 * The daily scan limit resets at the scanner's local midnight (plan §3.4).
 * "Local" comes from where the scan happened, not from the device, so
 * changing the phone's time zone buys nothing.
 */

export function timeZoneAt(lat: number, lng: number): string {
  try {
    return tzLookup(lat, lng);
  } catch {
    return "UTC";
  }
}

/** YYYY-MM-DD for `at` in `timeZone`. */
export function localDay(timeZone: string, at = new Date()): string {
  // en-CA formats as ISO date.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

type GeocodeFeature = {
  properties?: {
    name?: string;
    feature_type?: string;
    context?: { street?: { name?: string }; neighborhood?: { name?: string }; place?: { name?: string } };
  };
};

/**
 * "Mural on Bedford Ave" from Mapbox reverse geocoding; falls back to the
 * neighbourhood or city, and finally to a plain "Street art". Never throws —
 * a missing name must not fail a scan.
 */
export async function autoTitleFor(lat: number, lng: number): Promise<string> {
  const token = env.NEXT_PUBLIC_MAPBOX_API;
  if (!token) return "Street art";
  try {
    const url = new URL("https://api.mapbox.com/search/geocode/v6/reverse");
    url.search = new URLSearchParams({
      longitude: String(lng),
      latitude: String(lat),
      types: "address,street,neighborhood,place",
      limit: "1",
      access_token: token,
    }).toString();
    const res = await fetch(url, { signal: AbortSignal.timeout(2_500) });
    if (!res.ok) return "Street art";
    const { features } = (await res.json()) as { features?: GeocodeFeature[] };
    const p = features?.[0]?.properties;
    const street = p?.context?.street?.name ?? (p?.feature_type === "street" ? p.name : undefined);
    if (street) return `Mural on ${street}`;
    const area = p?.context?.neighborhood?.name ?? p?.context?.place?.name;
    return area ? `Mural in ${area}` : "Street art";
  } catch {
    return "Street art";
  }
}
