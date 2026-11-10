import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ArTrail } from "~/lib/api/types";
import { persistStorage } from "~/lib/storage";

/**
 * The trail the fan is following (docs/trails, "Follow mode"): the map draws its
 * path and shows the progress bar. Kept between launches, so a walk can pause
 * and resume. Same idea as the web app's `useFollowTrail`.
 */
export const useFollowTrail = create<{
  trailId: string | null;
  follow: (id: string) => void;
  stop: () => void;
}>()(
  persist(
    (set) => ({
      trailId: null,
      follow: (trailId) => set({ trailId }),
      stop: () => set({ trailId: null }),
    }),
    { name: "wadzzo-follow-trail", storage: persistStorage },
  ),
);

export const trailColor = (t: { color: string | null }) => t.color ?? "#16a34a";

export const distanceLabel = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export const MODE_VERB: Record<string, string> = { WALK: "walk", HIKE: "hike", BIKE: "ride", DRIVE: "drive" };

/** The stop to go to next: the first not done that isn't locked (or the first not done). */
export const nextStop = (t: ArTrail) =>
  t.stops.find((s) => !s.done && !s.lockReason && !s.unavailable) ?? t.stops.find((s) => !s.done) ?? null;

/** The path as one GeoJSON line per section; straight between stops where a section is missing. */
export function trailLines(t: ArTrail): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < t.stops.length - 1; i++) {
    const a = t.stops[i]!;
    const b = t.stops[i + 1]!;
    const section = t.path[i];
    const coordinates = section && section.length >= 2 ? section : [[a.lng, a.lat], [b.lng, b.lat]];
    features.push({ type: "Feature", properties: { done: a.done && b.done }, geometry: { type: "LineString", coordinates } });
  }
  return { type: "FeatureCollection", features };
}
