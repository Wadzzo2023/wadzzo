import { format, isSameDay, isSameYear } from "date-fns";

import { SERVER_URL } from "~/lib/api/client";
import type { ArEventCard } from "~/lib/api/types";

// Ported from wadzzoAR/src/lib/ar/events.ts — same wording and formats as the web.

/** "Sat 12 Oct · 6:00 PM – 9:00 PM", collapsing the parts both ends share. */
export function eventWhen(e: Pick<ArEventCard, "startDate" | "endDate">) {
  const start = new Date(e.startDate);
  const end = e.endDate ? new Date(e.endDate) : null;
  const day = isSameYear(start, new Date()) ? "EEE d MMM" : "EEE d MMM yyyy";
  const time = "h:mm a";
  if (!end) return `${format(start, day)} · ${format(start, time)}`;
  if (isSameDay(start, end)) return `${format(start, day)} · ${format(start, time)} – ${format(end, time)}`;
  return `${format(start, day)} – ${format(end, day)}`;
}

export function dateTile(iso: string) {
  const d = new Date(iso);
  return { month: format(d, "MMM"), day: format(d, "d") };
}

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

export function directionsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function venueMapImage(lat: number, lng: number, token: string, theme: "dark" | "light") {
  const style = theme === "dark" ? "dark-v11" : "light-v11";
  const marker = `pin-l+39ff88(${lng},${lat})`;
  return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${marker}/${lng},${lat},14.5,0/600x260@2x?access_token=${token}&attribution=false&logo=false`;
}

/** The web page for sharing — the same link works in a browser without the app. */
export const eventWebUrl = (id: string) => `${SERVER_URL}/events/${encodeURIComponent(id)}`;
export const announcementWebUrl = (id: string) => `${SERVER_URL}/announcements/${encodeURIComponent(id)}`;

/**
 * Served by wadzzoAR as `text/calendar`. Opened in the in-app browser, iOS
 * shows its native "Add to Calendar" sheet; Android hands it to the calendar
 * app. No native calendar module needed.
 */
export const eventIcsUrl = (id: string) => `${SERVER_URL}/api/events/${encodeURIComponent(id)}/ics`;
