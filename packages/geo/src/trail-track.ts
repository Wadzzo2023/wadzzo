/**
 * Off-road paths for map trails (docs/trails): a GPX track a brand imports, cut into the
 * sections between its stops, and the helpers fans need where there is no street route
 * (how far off the line you are, which way the next stop is). Pure functions.
 */

import { haversineMetres, type LatLng } from "./map-geometry";
import type { TrailSection } from "./trail-geometry";

type Pt = [number, number];

const toLatLng = ([lng, lat]: Pt): LatLng => ({ lat, lng });

/**
 * The points of a GPX file as [lng, lat]: its tracks (every segment, in file order), or its
 * route when it has no track. Empty when there is neither. Reads the text with patterns rather
 * than an XML parser, so it runs the same in the browser, the server and the tests.
 */
export function parseGpx(xml: string): Pt[] {
  const read = (tag: "trkpt" | "rtept") => {
    const points: Pt[] = [];
    for (const m of xml.matchAll(new RegExp(`<(?:\\w+:)?${tag}\\b([^>]*)>`, "g"))) {
      const attrs = m[1] ?? "";
      const lat = Number(/\blat\s*=\s*["']([^"']+)["']/.exec(attrs)?.[1]);
      const lon = Number(/\blon\s*=\s*["']([^"']+)["']/.exec(attrs)?.[1]);
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lon) <= 180
      )
        points.push([lon, lat]);
    }
    return points;
  };
  const track = read("trkpt");
  return track.length >= 2 ? track : read("rtept");
}

/** Metres on a flat plane around `origin` (fine over the few km a section spans). */
function project(origin: Pt) {
  const kx = 111_320 * Math.cos((origin[1] * Math.PI) / 180);
  const ky = 110_540;
  return (p: Pt): [number, number] => [(p[0] - origin[0]) * kx, (p[1] - origin[1]) * ky];
}

/** Distance from point p to segment ab, and where along it (0..1), in projected metres. */
function toSegment(p: [number, number], a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  const x = a[0] + t * dx - p[0];
  const y = a[1] + t * dy - p[1];
  return { metres: Math.hypot(x, y), t };
}

/**
 * The line with fewer points, keeping its shape within `toleranceMetres` (Douglas–Peucker).
 * The first and last points are always kept.
 */
export function simplifyLine(line: Pt[], toleranceMetres: number): Pt[] {
  if (line.length <= 2) return line;
  const xy = project(line[0]!);
  const pts = line.map(xy);
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop()!;
    let worst = -1;
    let at = -1;
    for (let i = from + 1; i < to; i++) {
      const d = toSegment(pts[i]!, pts[from]!, pts[to]!).metres;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (at > 0 && worst > toleranceMetres) {
      keep[at] = 1;
      stack.push([from, at], [at, to]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/** Simplified until it has at most `maxPoints` (the tolerance doubles from 1 m each try). */
export function fitPoints(line: Pt[], maxPoints: number): Pt[] {
  let out = simplifyLine(line, 1);
  for (let tol = 2; out.length > maxPoints && tol < 10_000; tol *= 2) out = simplifyLine(line, tol);
  return out;
}

/** Where a point is closest to a line: the segment index, how far along it, and how far off. */
export type LinePosition = { index: number; t: number; metres: number };

/** The closest position on `line` to `p`, searching segments from `fromIndex` on. */
export function nearestOnLine(line: Pt[], p: LatLng, fromIndex = 0): LinePosition | null {
  if (line.length < 2) return null;
  const xy = project([p.lng, p.lat]);
  const q = xy([p.lng, p.lat]);
  let best: LinePosition | null = null;
  for (let i = Math.max(0, fromIndex); i < line.length - 1; i++) {
    const { metres, t } = toSegment(q, xy(line[i]!), xy(line[i + 1]!));
    if (!best || metres < best.metres) best = { index: i, t, metres };
  }
  return best;
}

/** How far `p` is from the nearest point of any section, in metres (Infinity with no path). */
export function metresOffPath(sections: TrailSection[], p: LatLng): number {
  let best = Infinity;
  for (const s of sections) {
    const pos = nearestOnLine(s, p);
    if (pos) best = Math.min(best, pos.metres);
  }
  return best;
}

const before = (a: LinePosition, b: LinePosition) =>
  a.index < b.index || (a.index === b.index && a.t < b.t);

/**
 * A track cut into one section per pair of stops in order, each starting at its stop and
 * ending at the next, following the track in between. A stop further than `maxOffMetres`
 * from the track, or stops that don't come in the track's direction (tried both ways round),
 * leave that section null (the caller keeps it straight). Each stop is looked for after the
 * last one, so a loop that starts and ends at the same place cuts correctly.
 */
export function cutTrack(
  track: Pt[],
  stops: LatLng[],
  maxOffMetres = 150,
): (TrailSection | null)[] {
  const tryWay = (line: Pt[]) => {
    const out: (TrailSection | null)[] = [];
    let from = 0;
    let prev: LinePosition | null = null;
    let hits = 0;
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i]!;
      const pos = nearestOnLine(line, s, from);
      const ok = pos && pos.metres <= maxOffMetres && (!prev || before(prev, pos));
      if (i > 0) {
        const a = stops[i - 1]!;
        out.push(
          ok && prev
            ? [[a.lng, a.lat], ...line.slice(prev.index + 1, pos.index + 1), [s.lng, s.lat]]
            : null,
        );
      }
      if (ok) {
        hits++;
        prev = pos;
        from = pos.index;
      } else prev = null;
    }
    return { out, hits: out.filter(Boolean).length + hits / 1000 };
  };
  const forward = tryWay(track);
  const backward = tryWay([...track].reverse());
  return (backward.hits > forward.hits ? backward : forward).out;
}

/** Compass bearing from a to b in degrees (0 = north, 90 = east). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** "N", "NE", … for a bearing. */
export function compassPoint(deg: number): string {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
    Math.round((((deg % 360) + 360) % 360) / 45) % 8
  ]!;
}

/** Total length of a [lng, lat] line in metres. */
export function lineMetres(line: Pt[]): number {
  let m = 0;
  for (let i = 1; i < line.length; i++)
    m += haversineMetres(toLatLng(line[i - 1]!), toLatLng(line[i]!));
  return m;
}
