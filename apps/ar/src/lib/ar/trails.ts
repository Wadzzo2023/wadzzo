import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { RouterOutputs } from "~/utils/api";

/** A trail as the fan app gets it (`trails.get` / `trails.nearby`): stops, path, my progress. */
export type FanTrail = RouterOutputs["trails"]["get"];
export type FanTrailStop = FanTrail["stops"][number];

/**
 * The trail the fan is following (docs/trails, "Follow mode"): the map draws its path, numbers
 * its stops and shows the progress bar. Kept between visits, so a walk can pause and resume.
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
    { name: "wadzzo-ar-follow-trail" },
  ),
);

export const trailColor = (t: { color: string | null }) => t.color ?? "#16a34a";

export const distanceLabel = (m: number) =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;

/** The stop to go to next: the first not done that isn't locked (or the first not done). */
export const nextStop = (t: FanTrail) =>
  t.stops.find((s) => !s.done && !s.lockReason && !s.unavailable) ??
  t.stops.find((s) => !s.done) ??
  null;

/** Pin ids (locations) of stops the fan can't collect yet, for auto-collect to skip. */
export function lockedPinIds(trails: FanTrail[]) {
  const ids = new Set<string>();
  for (const t of trails) for (const s of t.stops) if (s.lockReason && s.pinId) ids.add(s.pinId);
  return ids;
}
