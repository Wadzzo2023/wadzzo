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
  /** Trails whose "Trail complete!" sheet was shown, so it shows once each. */
  celebrated: string[];
  follow: (id: string) => void;
  stop: () => void;
  markCelebrated: (id: string) => void;
}>()(
  persist(
    (set) => ({
      trailId: null,
      celebrated: [],
      follow: (trailId) => set({ trailId }),
      stop: () => set({ trailId: null }),
      markCelebrated: (id) =>
        set((s) => ({ celebrated: [...s.celebrated.filter((x) => x !== id), id].slice(-50) })),
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

export const MODE_VERB: Record<string, string> = {
  WALK: "walk",
  HIKE: "hike",
  BIKE: "ride",
  DRIVE: "drive",
};

/** Google's encoded polyline (precision 5), as the Mapbox Static Images API takes it. */
function encodePolyline(points: [number, number][]) {
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const [lng, lat] of points) {
    const la = Math.round(lat * 1e5);
    const ln = Math.round(lng * 1e5);
    enc(la - prevLat);
    enc(ln - prevLng);
    prevLat = la;
    prevLng = ln;
  }
  return out;
}

/**
 * A static picture of the trail on the map (list cards): the path over a white outline and
 * a numbered pin per stop, framed to fit. A picture, not a live map: a list doesn't pan.
 */
export function routeMapImage(
  t: Pick<FanTrail, "path" | "stops" | "color">,
  token: string,
  theme: "dark" | "light",
  size = { w: 600, h: 240 },
) {
  const hex = trailColor(t).replace("#", "");
  const line: [number, number][] = t.path.length
    ? t.path.flat()
    : t.stops.map((s) => [s.lng, s.lat] as [number, number]);
  // Keep the URL short: a card needs the shape, not every bend.
  const step = Math.max(1, Math.ceil(line.length / 120));
  const pts = line.filter((_, i) => i % step === 0 || i === line.length - 1);
  const poly = encodeURIComponent(encodePolyline(pts));
  const overlays = [
    `path-9+ffffff-0.85(${poly})`,
    `path-5+${hex}-1(${poly})`,
    ...t.stops.map((s) => `pin-s-${s.position}+${hex}(${s.lng.toFixed(5)},${s.lat.toFixed(5)})`),
  ].join(",");
  const style = theme === "dark" ? "dark-v11" : "light-v11";
  return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${overlays}/auto/${size.w}x${size.h}@2x?padding=36&access_token=${token}&attribution=false&logo=false`;
}
