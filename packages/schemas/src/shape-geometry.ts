/**
 * Geometry for the Pin Studio shape editor: turning points into an outline
 * path, checking an outline, and tracing an image into one. Pure functions
 * (no DOM), so the browser editor and the tests share them.
 *
 * Every outline lives in the 100×100 pin box (see ./pin-look).
 */

export type Pt = [number, number];

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (p: Pt) => `${r2(p[0])} ${r2(p[1])}`;
const clampBox = (n: number) => Math.max(0, Math.min(100, n));

/**
 * One point of an outline. A smooth point bends the outline through it (the
 * curve's direction follows its neighbours); a corner point makes a sharp turn.
 */
export type Node = { x: number; y: number; smooth: boolean };

/** Where the curve leaves (`dir` 1) or arrives at (`dir` -1) node `i`, for a smooth node. */
function handle(nodes: Node[], i: number, dir: 1 | -1): Pt {
  const n = nodes.length;
  const prev = nodes[(i - 1 + n) % n]!;
  const next = nodes[(i + 1) % n]!;
  const p = nodes[i]!;
  return [
    clampBox(p.x + (dir * (next.x - prev.x)) / 6),
    clampBox(p.y + (dir * (next.y - prev.y)) / 6),
  ];
}

/**
 * Closed outline through `nodes`. A side between two corners is a straight
 * line; a side touching a smooth point is a curve. `pathToNodes` reads it back.
 */
export function nodesToPath(nodes: Node[]): string {
  const n = nodes.length;
  if (n < 3) return "";
  let d = `M${fmt([nodes[0]!.x, nodes[0]!.y])}`;
  for (let i = 0; i < n; i++) {
    const a = nodes[i]!;
    const b = nodes[(i + 1) % n]!;
    const closing = i === n - 1;
    if (!a.smooth && !b.smooth) {
      if (!closing) d += ` L${fmt([b.x, b.y])}`; // the last straight side is drawn by Z
      continue;
    }
    const c1: Pt = a.smooth ? handle(nodes, i, 1) : [a.x, a.y];
    const c2: Pt = b.smooth ? handle(nodes, (i + 1) % n, -1) : [b.x, b.y];
    d += ` C${fmt(c1)} ${fmt(c2)} ${fmt([b.x, b.y])}`;
  }
  return `${d} Z`;
}

/** Closed outline through `pts`: straight sides, or smooth curves through every point. */
export function pointsToPath(pts: Pt[], smooth = false): string {
  return nodesToPath(pts.map(([x, y]) => ({ x, y, smooth })));
}

const near = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 0.011 && Math.abs(a[1] - b[1]) < 0.011;

/**
 * The points of an outline this editor wrote (see `nodesToPath`), each marked
 * corner or smooth. Null for anything else (arcs, several outlines), which
 * can only be replaced, not edited point by point.
 */
export function pathToNodes(path: string): Node[] | null {
  const tokens = path.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[A-Za-z]/g) ?? [];
  type Seg = { to: Pt; c1?: Pt; c2?: Pt };
  let start: Pt | null = null;
  const segs: Seg[] = [];
  let i = 0;
  let closed = false;
  const isCmd = (t: string | undefined) => t !== undefined && /^[A-Za-z]$/.test(t);
  const pt = (): Pt => [Number(tokens[i++]), Number(tokens[i++])];
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "M") {
      if (start) return null; // a second outline
      start = pt();
    } else if (cmd === "L") {
      while (i < tokens.length && !isCmd(tokens[i])) segs.push({ to: pt() });
    } else if (cmd === "C") {
      while (i < tokens.length && !isCmd(tokens[i])) {
        const c1 = pt();
        const c2 = pt();
        segs.push({ c1, c2, to: pt() });
      }
    } else if (cmd === "Z") {
      closed = true;
      if (i < tokens.length) return null;
    } else return null;
  }
  if (!start || !closed) return null;
  const pts: Pt[] = [start, ...segs.map((sg) => sg.to)];
  if (pts.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return null;
  // A closing side drawn out in full ends on the first point: that end isn't a new point.
  if (pts.length > 1 && near(pts[pts.length - 1]!, start)) pts.pop();
  const n = pts.length;
  if (n < 3) return null;
  // Side k runs from point k to k+1; the side Z draws (if any) is straight.
  return pts.map(([x, y], k) => {
    const out = segs[k];
    const inc = segs[(k - 1 + n) % n];
    const smoothOut = Boolean(out?.c1 && !near(out.c1, [x, y]));
    const smoothIn = Boolean(inc?.c2 && !near(inc.c2, [x, y]));
    return { x, y, smooth: smoothOut || smoothIn };
  });
}

/**
 * A freehand stroke (in box units) as an editable closed outline: the stroke
 * is closed, thinned out, and every point made smooth. Too short a stroke → [].
 */
export function freehandToNodes(samples: Pt[], tolerance = 1.2): Node[] {
  const clean = samples
    .map(([x, y]) => [clampBox(x), clampBox(y)] as Pt)
    .filter(
      (p, k, all) => k === 0 || Math.hypot(p[0] - all[k - 1]![0], p[1] - all[k - 1]![1]) > 0.3,
    );
  if (clean.length < 6) return [];
  const pts = simplify(clean, tolerance);
  return pts.length >= 3 ? pts.map(([x, y]) => ({ x, y, smooth: true })) : [];
}

/** The outline mirrored left↔right (`"x"`) or upside down (`"y"`), keeping its winding. */
export function flipNodes(nodes: Node[], axis: "x" | "y"): Node[] {
  return nodes
    .map((p) => (axis === "x" ? { ...p, x: r2(100 - p.x) } : { ...p, y: r2(100 - p.y) }))
    .reverse();
}

/** Signed area (positive = clockwise in screen coordinates). */
export function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Whether any two non-neighbouring sides of the closed outline cross. */
export function selfIntersects(pts: Pt[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // neighbours through the closing side
      if (segmentsCross(a, b, pts[j]!, pts[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

/** Problems a drawn outline would have as a pin, in plain words; empty when it's fine. */
export function outlineProblems(pts: Pt[]): string[] {
  const out: string[] = [];
  if (pts.length < 3) return ["Place at least 3 points"];
  if (selfIntersects(pts)) {
    // A crossed outline's area isn't meaningful (a figure 8's halves cancel out), so say only this.
    out.push("The outline crosses itself — move a point so it doesn't");
  } else if (Math.abs(polygonArea(pts)) < 1200) {
    // Under 12% of the box, an image inside is too small to make out.
    out.push("The shape is too small or thin to hold an image — make it bigger");
  }
  if (pts.length > 400) out.push("Too many points — simplify the outline");
  return out;
}

/** The same points mirrored left↔right about x = 50 (for symmetric drawing). */
export function mirrorPoints(half: Pt[]): Pt[] {
  if (half.length < 2) return half;
  const mirrored = half
    .slice()
    .reverse()
    .map(([x, y]) => [100 - x, y] as Pt)
    // points on the axis aren't doubled
    .filter(([x]) => Math.abs(x - 50) > 0.5);
  return [...half, ...mirrored];
}

/**
 * Scales and centres points to fill the pin box (4–96), keeping their
 * proportions. Used for traced and imported outlines.
 */
export function fitToBox(pts: Pt[], margin = 4): Pt[] {
  if (!pts.length) return pts;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX || 1;
  const h = Math.max(...ys) - minY || 1;
  const size = 100 - margin * 2;
  const k = size / Math.max(w, h);
  const ox = margin + (size - w * k) / 2;
  const oy = margin + (size - h * k) / 2;
  return pts.map(([x, y]) => [r2(ox + (x - minX) * k), r2(oy + (y - minY) * k)]);
}

/** Ramer–Douglas–Peucker: drops points that lie within `epsilon` of the line between their neighbours. */
export function simplify(pts: Pt[], epsilon: number): Pt[] {
  if (pts.length < 4 || epsilon <= 0) return pts;
  const dist = (p: Pt, a: Pt, b: Pt) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
  };
  const rdp = (list: Pt[]): Pt[] => {
    let max = 0;
    let idx = 0;
    for (let i = 1; i < list.length - 1; i++) {
      const d = dist(list[i]!, list[0]!, list[list.length - 1]!);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max <= epsilon) return [list[0]!, list[list.length - 1]!];
    const left = rdp(list.slice(0, idx + 1));
    const right = rdp(list.slice(idx));
    return [...left.slice(0, -1), ...right];
  };
  // Closed outline: split at the point farthest from the first, simplify both halves.
  let far = 0;
  let farD = -1;
  pts.forEach((p, i) => {
    const d = Math.hypot(p[0] - pts[0]![0], p[1] - pts[0]![1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  });
  const a = rdp(pts.slice(0, far + 1));
  const b = rdp([...pts.slice(far), pts[0]!]);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 3 ? out : pts;
}

/**
 * The outer outline of the largest filled region of a `w`×`h` mask (1 =
 * inside), by following its boundary (Moore neighbour tracing). Holes are
 * ignored: a pin shape is one solid outline. Returns points in mask pixels.
 */
export function traceMask(mask: Uint8Array, w: number, h: number): Pt[] {
  // Largest connected region (4-neighbour flood fill), so specks are ignored.
  const label = new Int32Array(w * h);
  let best = { id: 0, size: 0, start: -1 };
  let next = 1;
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || label[i]) continue;
    let size = 0;
    label[i] = next;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop()!;
      size++;
      const x = j % w;
      const y = (j - x) / w;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (mask[k] && !label[k]) {
          label[k] = next;
          stack.push(k);
        }
      }
    }
    if (size > best.size) best = { id: next, size, start: i };
    next++;
  }
  if (best.start < 0) return [];
  const inRegion = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && label[y * w + x] === best.id;

  // Marching squares around the region, starting at its first pixel (top-most, then
  // left-most), so the walk goes round the outside. Corners are kept where the walk turns.
  const sx = best.start % w;
  const sy = (best.start - sx) / w;
  // step for each 2×2 cell state (1 = top-left … 8 = bottom-right inside)
  const DX = [1, 0, 1, 1, -1, 0, -1, 1, 0, 0, 0, 0, -1, 0, -1, 0];
  const DY = [0, -1, 0, 0, 0, -1, 0, 0, 1, -1, 1, 1, 0, -1, 0, 0];
  const out: Pt[] = [];
  let x = sx;
  let y = sy;
  let pdx = NaN;
  let pdy = NaN;
  const limit = (w + 1) * (h + 1) * 4;
  for (let step = 0; step < limit; step++) {
    let state = 0;
    if (inRegion(x - 1, y - 1)) state += 1;
    if (inRegion(x, y - 1)) state += 2;
    if (inRegion(x - 1, y)) state += 4;
    if (inRegion(x, y)) state += 8;
    let dx: number;
    let dy: number;
    if (state === 6) {
      dx = pdy === -1 ? -1 : 1;
      dy = 0;
    } else if (state === 9) {
      dx = 0;
      dy = pdx === 1 ? -1 : 1;
    } else {
      dx = DX[state]!;
      dy = DY[state]!;
    }
    if (dx !== pdx && dy !== pdy) {
      out.push([x, y]);
      pdx = dx;
      pdy = dy;
    }
    x += dx;
    y += dy;
    if (x === sx && y === sy) break;
  }
  return out;
}

/**
 * Image pixels → an outline path for a pin shape. `rgba` is the image's RGBA
 * bytes at `w`×`h`. A pixel counts as "inside" when it's opaque and, unless
 * the image has transparency, darker than `threshold` (0–255). `detail`
 * (0–1) trades smoothness for precision.
 */
export function traceImage(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  opts: { threshold?: number; detail?: number; invert?: boolean; smooth?: boolean } = {},
): { path: string; points: Pt[] } | null {
  const threshold = opts.threshold ?? 160;
  const detail = Math.max(0, Math.min(1, opts.detail ?? 0.5));
  // Images with real transparency are traced by their alpha; others by brightness.
  let transparent = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i]! < 128) transparent++;
  const useAlpha = transparent > (w * h) / 50;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    const a = rgba[i * 4 + 3]!;
    let inside = useAlpha ? a >= 128 : a >= 128 && 0.299 * r + 0.587 * g + 0.114 * b < threshold;
    if (opts.invert) inside = !inside && a >= 128;
    mask[i] = inside ? 1 : 0;
  }
  const raw = traceMask(mask, w, h);
  if (raw.length < 3) return null;
  const boxed = fitToBox(raw);
  // detail 1 → 0.4 box units, detail 0 → 4 units
  const pts = simplify(boxed, 4 - detail * 3.6);
  if (pts.length < 3) return null;
  return { path: pointsToPath(pts, opts.smooth ?? true), points: pts };
}

/** The points of an outline this editor wrote, and whether any of them is smooth. */
export function pathToPoints(path: string): { points: Pt[]; smooth: boolean } | null {
  const nodes = pathToNodes(path);
  if (!nodes) return null;
  return { points: nodes.map((p) => [p.x, p.y] as Pt), smooth: nodes.some((p) => p.smooth) };
}
