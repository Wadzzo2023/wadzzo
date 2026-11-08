/**
 * How big a pin shape looks. Every shape is drawn in the same 100×100 box, but
 * a square fills most of it and a thin cross very little, so at the same marker
 * size the cross looks far smaller. These pure functions measure how much of
 * its box a shape fills (`pathCoverage`) and how much larger its marker should
 * be drawn so shapes carry about the same visual weight on a map
 * (`markerScale`).
 */

import type { Pt } from "./shape-geometry";

/** Read an outline path as polygons (curves are sampled), or null when it can't be read. */
export function flattenPath(path: string): Pt[][] | null {
  const tokens = path.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[A-Za-z]/g);
  if (!tokens?.length) return null;
  const polygons: Pt[][] = [];
  let poly: Pt[] = [];
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  let lastC: Pt | null = null; // previous cubic control point, for S
  let lastQ: Pt | null = null; // previous quadratic control point, for T
  let i = 0;
  const isCmd = (t: string | undefined) => t !== undefined && /^[A-Za-z]$/.test(t);
  const num = () => Number(tokens[i++]);
  const more = () => i < tokens.length && !isCmd(tokens[i]);
  const flush = () => {
    if (poly.length > 2) polygons.push(poly);
    poly = [];
  };
  const push = (p: Pt) => {
    poly.push(p);
    cur = p;
  };
  const STEPS = 16;
  const cubic = (p0: Pt, c1: Pt, c2: Pt, p1: Pt) => {
    for (let s = 1; s <= STEPS; s++) {
      const t = s / STEPS;
      const u = 1 - t;
      push([
        u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
        u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
      ]);
    }
  };
  const quad = (p0: Pt, c: Pt, p1: Pt) => {
    for (let s = 1; s <= STEPS; s++) {
      const t = s / STEPS;
      const u = 1 - t;
      push([
        u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
        u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
      ]);
    }
  };
  /** SVG elliptical arc → points (the standard endpoint-to-centre conversion). */
  const arc = (
    p0: Pt,
    rxIn: number,
    ryIn: number,
    rot: number,
    large: number,
    sweep: number,
    p1: Pt,
  ) => {
    let rx = Math.abs(rxIn);
    let ry = Math.abs(ryIn);
    if (!rx || !ry || (p0[0] === p1[0] && p0[1] === p1[1])) return push(p1);
    const phi = (rot * Math.PI) / 180;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    const dx = (p0[0] - p1[0]) / 2;
    const dy = (p0[1] - p1[1]) / 2;
    const x1 = cos * dx + sin * dy;
    const y1 = -sin * dx + cos * dy;
    const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lambda > 1) {
      rx *= Math.sqrt(lambda);
      ry *= Math.sqrt(lambda);
    }
    const num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num2 / den));
    const cx1 = (k * rx * y1) / ry;
    const cy1 = (-k * ry * x1) / rx;
    const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2;
    const cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2;
    const angle = (ux: number, uy: number, vx: number, vy: number) =>
      Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const th1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
    let dth = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
    if (!sweep && dth > 0) dth -= 2 * Math.PI;
    if (sweep && dth < 0) dth += 2 * Math.PI;
    const n = Math.max(8, Math.ceil((Math.abs(dth) / (2 * Math.PI)) * 48));
    for (let s = 1; s <= n; s++) {
      const th = th1 + (dth * s) / n;
      push([
        cos * rx * Math.cos(th) - sin * ry * Math.sin(th) + cx,
        sin * rx * Math.cos(th) + cos * ry * Math.sin(th) + cy,
      ]);
    }
  };

  while (i < tokens.length) {
    const cmd = tokens[i++]!;
    if (!isCmd(cmd)) return null;
    if (cmd !== "C" && cmd !== "S") lastC = null;
    if (cmd !== "Q" && cmd !== "T") lastQ = null;
    switch (cmd) {
      case "M":
        flush();
        start = [num(), num()];
        push(start);
        while (more()) push([num(), num()]); // extra pairs are implicit lines
        break;
      case "L":
        while (more()) push([num(), num()]);
        break;
      case "H":
        while (more()) push([num(), cur[1]]);
        break;
      case "V":
        while (more()) push([cur[0], num()]);
        break;
      case "C":
        while (more()) {
          const p0 = cur;
          const c1: Pt = [num(), num()];
          const c2: Pt = [num(), num()];
          const p1: Pt = [num(), num()];
          cubic(p0, c1, c2, p1);
          lastC = c2;
        }
        break;
      case "S":
        while (more()) {
          const p0 = cur;
          const c1: Pt = lastC ? [2 * p0[0] - lastC[0], 2 * p0[1] - lastC[1]] : p0;
          const c2: Pt = [num(), num()];
          const p1: Pt = [num(), num()];
          cubic(p0, c1, c2, p1);
          lastC = c2;
        }
        break;
      case "Q":
        while (more()) {
          const p0 = cur;
          const c: Pt = [num(), num()];
          const p1: Pt = [num(), num()];
          quad(p0, c, p1);
          lastQ = c;
        }
        break;
      case "T":
        while (more()) {
          const p0 = cur;
          const c: Pt = lastQ ? [2 * p0[0] - lastQ[0], 2 * p0[1] - lastQ[1]] : p0;
          const p1: Pt = [num(), num()];
          quad(p0, c, p1);
          lastQ = c;
        }
        break;
      case "A":
        while (more()) {
          const rx = num();
          const ry = num();
          const rot = num();
          const large = num();
          const sweep = num();
          arc(cur, rx, ry, rot, large, sweep, [num(), num()]);
        }
        break;
      case "Z":
        cur = start;
        flush();
        break;
      default:
        return null; // relative or unknown commands: not a shape this app writes
    }
  }
  flush();
  const all = polygons.flat();
  return polygons.length && all.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    ? polygons
    : null;
}

/** The share (0–1) of its 100×100 box that a shape fills; 0 when the path can't be read. */
export function pathCoverage(path: string): number {
  const polygons = flattenPath(path);
  if (!polygons) return 0;
  let area = 0;
  for (const pts of polygons) {
    for (let k = 0; k < pts.length; k++) {
      const [x1, y1] = pts[k]!;
      const [x2, y2] = pts[(k + 1) % pts.length]!;
      area += x1 * y2 - x2 * y1;
    }
  }
  return Math.min(1, Math.abs(area / 2) / 10_000);
}

/** The share of its box a shape fills below which it looks thin on a map. */
export const THIN_SHAPE_COVERAGE = 0.25;
/** The visual weight shapes are brought towards (about a circle's). */
const TARGET_COVERAGE = 0.6;
/** The most a thin shape's marker is made larger. */
export const MAX_MARKER_SCALE = 1.3;

/**
 * How much larger than the usual size a shape's marker is drawn, so a thin
 * shape carries about the weight of a rounder one. Never smaller than usual
 * (1), never more than `MAX_MARKER_SCALE`.
 */
export function markerScale(coverage: number): number {
  if (!(coverage > 0)) return 1;
  return Math.max(1, Math.min(MAX_MARKER_SCALE, Math.sqrt(TARGET_COVERAGE / coverage)));
}
