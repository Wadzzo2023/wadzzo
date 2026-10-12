import { format, isSameDay, isSameYear } from "date-fns";

import type { ArEventCard, ArEventDetail } from "./types";
import { platformBranding } from "@wadzzo/platform/branding";

/**
 * ── Event helpers ──────────────────────────────────────────────────────────
 *
 * Formatting and hand-off links shared by the event list and detail pages.
 * Kept free of React so the mobile app can port it line for line.
 */

/** "Sat 12 Oct · 6:00 PM – 9:00 PM", collapsing the parts both ends share. */
export function eventWhen(e: Pick<ArEventCard, "startDate" | "endDate">) {
  const start = new Date(e.startDate);
  const end = e.endDate ? new Date(e.endDate) : null;
  const now = new Date();
  const day = isSameYear(start, now) ? "EEE d MMM" : "EEE d MMM yyyy";
  const time = "h:mm a";
  if (!end) return `${format(start, day)} · ${format(start, time)}`;
  if (isSameDay(start, end)) {
    return `${format(start, day)} · ${format(start, time)} – ${format(end, time)}`;
  }
  return `${format(start, day)} – ${format(end, day)}`;
}

/** Big date tile on the card: month + day of the start. */
export function dateTile(iso: string) {
  const d = new Date(iso);
  return { month: format(d, "MMM"), day: format(d, "d") };
}

/** Short status line for the corner badge, or null when it's just upcoming. */
export function liveState(e: Pick<ArEventCard, "startDate" | "endDate">) {
  const now = Date.now();
  const start = new Date(e.startDate).getTime();
  const end = e.endDate ? new Date(e.endDate).getTime() : start;
  if (end < now) return "ended" as const;
  if (start <= now) return "live" as const;
  return null;
}

export function spotsLabel(e: Pick<ArEventCard, "goingCount" | "capacity">) {
  if (e.capacity == null) return `${e.goingCount} going`;
  const left = Math.max(0, e.capacity - e.goingCount);
  return left === 0 ? "Full" : `${left} of ${e.capacity} spots left`;
}

/** Opens turn-by-turn in whatever maps app the device prefers. */
export function directionsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/**
 * A Mapbox static image for the venue — a picture, not a live map, since all
 * it has to do is show where the place is; the Directions button does the
 * rest.
 */
export function venueMapImage(
  lat: number,
  lng: number,
  token: string,
  theme: "dark" | "light",
  size = { w: 600, h: 260 },
) {
  const style = theme === "dark" ? "dark-v11" : "light-v11";
  const marker = `pin-l+39ff88(${lng},${lat})`;
  return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${marker}/${lng},${lat},14.5,0/${size.w}x${size.h}@2x?access_token=${token}&attribution=false&logo=false`;
}

// ── Add to calendar (.ics) ───────────────────────────────────────────────

const icsDate = (iso: string) =>
  new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** RFC 5545 text escaping, then 75-octet line folding. */
const icsText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

export type IcsEvent = Pick<
  ArEventDetail,
  "id" | "title" | "description" | "link" | "venueName" | "address" | "latitude" | "longitude" | "startDate" | "endDate"
> & { brand: { name: string } };

export function eventIcs(e: IcsEvent, pageUrl: string) {
  const location = [e.venueName, e.address].filter(Boolean).join(", ");
  const description = [e.description, e.link ? `\n${e.link}` : "", `\n${pageUrl}`].join("");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${platformBranding.calendar.productId}//Events//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@${platformBranding.calendar.uidDomain}`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(e.startDate)}`,
    `DTEND:${icsDate(e.endDate ?? e.startDate)}`,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText(description)}`,
    location && `LOCATION:${icsText(location)}`,
    e.latitude != null && e.longitude != null && `GEO:${e.latitude};${e.longitude}`,
    `URL:${pageUrl}`,
    `ORGANIZER;CN=${icsText(e.brand.name)}:MAILTO:${platformBranding.contact.supportEmail}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => Boolean(l));
  return lines.map(fold).join("\r\n") + "\r\n";
}

/**
 * Served as `text/calendar`, which iOS answers with its own "Add to Calendar"
 * sheet and Android hands to the calendar app — better on both than a blob
 * download, and the mobile app can open the same URL.
 */
export const icsPath = (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/ics`;

/**
 * Native share sheet where there is one, clipboard where there isn't.
 * Returns what happened so the page can say "Link copied".
 */
export async function shareLink(title: string, url: string) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return "shared" as const;
    } catch {
      return "cancelled" as const;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied" as const;
  } catch {
    return "cancelled" as const;
  }
}
