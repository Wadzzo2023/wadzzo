/**
 * ── Mural localisation (copy of wadzzoAR src/lib/murals/localize.ts — keep in step) ──
 *
 * The detector only answers "is there street art in view". This finds WHERE,
 * for the on-camera outline (2026-10-05 round: "smart: quad, else box"):
 *
 *  1. Box — the frame is cut into overlapping crops, each scored with the
 *     same MobileCLIP model; crops that look like art pull a weighted box
 *     towards themselves. Works on anything, including free-form graffiti.
 *  2. Quad — inside that box (plus a margin) we look for the wall's own
 *     edges: Sobel gradients on a small grayscale image, then the strongest
 *     near-horizontal line in the top and bottom bands and near-vertical line
 *     in the left and right bands (a tiny Hough search). The four lines
 *     intersect into a perspective quad. If it isn't a believable shape
 *     (convex, sensible size, close to the box) we keep the box.
 *
 * All coordinates are normalised 0–1 over the full camera frame.
 * Pure TS, no dependencies, allocation-light: it runs ~2×/s.
 */

export type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Outline = { kind: "quad"; pts: [Pt, Pt, Pt, Pt] } | { kind: "box"; rect: Rect };

/** Overlapping crop grid. 3×3 at 50% size (stride 25%) on fast devices, 5 crops otherwise. */
export function cropGrid(fast: boolean): Rect[] {
  if (!fast) {
    const s = 0.6;
    return [
      { x: 0, y: 0, w: s, h: s },
      { x: 1 - s, y: 0, w: s, h: s },
      { x: 0, y: 1 - s, w: s, h: s },
      { x: 1 - s, y: 1 - s, w: s, h: s },
      { x: 0.2, y: 0.2, w: s, h: s },
    ];
  }
  const out: Rect[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push({ x: c * 0.25, y: r * 0.25, w: 0.5, h: 0.5 });
  return out;
}

/**
 * Weighted box from crop scores. Crops below `floor` don't vote; the rest
 * vote with score² so the clearly-art crops dominate. The box is the
 * weighted bounds of the voters, pulled 15% towards the weighted centre so it
 * hugs the art rather than the crop edges. Null when nothing scored.
 */
export function boxFromScores(crops: Rect[], scores: number[], floor = 0.35): Rect | null {
  let wSum = 0;
  let cx = 0;
  let cy = 0;
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  const best = Math.max(...scores);
  if (best < floor) return null;
  crops.forEach((c, i) => {
    const s = scores[i]!;
    if (s < Math.max(floor, best * 0.55)) return;
    const w = s * s;
    wSum += w;
    cx += (c.x + c.w / 2) * w;
    cy += (c.y + c.h / 2) * w;
    x0 = Math.min(x0, c.x);
    y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x + c.w);
    y1 = Math.max(y1, c.y + c.h);
  });
  if (!wSum) return null;
  cx /= wSum;
  cy /= wSum;
  const pull = 0.15;
  x0 += (cx - x0) * pull;
  x1 += (cx - x1) * pull;
  y0 += (cy - y0) * pull;
  y1 += (cy - y1) * pull;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Small RGB image (0–255, interleaved) of the full frame, e.g. 160×120. */
export type Rgb = { data: Uint8Array | Uint8ClampedArray; w: number; h: number };

function luma(img: Rgb): Float32Array {
  const out = new Float32Array(img.w * img.h);
  for (let i = 0, j = 0; i < out.length; i++, j += 3) out[i] = 0.299 * img.data[j]! + 0.587 * img.data[j + 1]! + 0.114 * img.data[j + 2]!;
  return out;
}

type Line = { theta: number; rho: number; votes: number };

/**
 * Strongest line in a band of the edge map, restricted to angles near
 * `around` (0 = vertical edge, π/2 = horizontal edge) ± `spread`.
 */
function bandLine(mag: Float32Array, gw: number, band: { x0: number; y0: number; x1: number; y1: number }, around: number, spread: number, thresh: number): Line | null {
  const STEPS = 21;
  const thetas: number[] = [];
  for (let i = 0; i < STEPS; i++) thetas.push(around - spread + (2 * spread * i) / (STEPS - 1));
  const diag = Math.ceil(Math.hypot(gw, mag.length / gw));
  const RB = 2 * diag + 1;
  const acc = new Float32Array(STEPS * RB);
  const cos = thetas.map(Math.cos);
  const sin = thetas.map(Math.sin);
  for (let y = band.y0; y < band.y1; y++) {
    for (let x = band.x0; x < band.x1; x++) {
      const m = mag[y * gw + x]!;
      if (m < thresh) continue;
      for (let t = 0; t < STEPS; t++) {
        const rho = Math.round(x * cos[t]! + y * sin[t]!) + diag;
        acc[t * RB + rho]! += m;
      }
    }
  }
  let best = 0;
  let bi = -1;
  for (let i = 0; i < acc.length; i++) {
    if (acc[i]! > best) {
      best = acc[i]!;
      bi = i;
    }
  }
  if (bi < 0) return null;
  const t = Math.floor(bi / RB);
  return { theta: thetas[t]!, rho: (bi % RB) - diag, votes: best };
}

function intersect(a: Line, b: Line): Pt | null {
  const det = Math.cos(a.theta) * Math.sin(b.theta) - Math.sin(a.theta) * Math.cos(b.theta);
  if (Math.abs(det) < 1e-6) return null;
  return {
    x: (a.rho * Math.sin(b.theta) - b.rho * Math.sin(a.theta)) / det,
    y: (b.rho * Math.cos(a.theta) - a.rho * Math.cos(b.theta)) / det,
  };
}

function convex(p: Pt[]) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % 4]!;
    const c = p[(i + 2) % 4]!;
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) return false;
    const s = Math.sign(z);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

function polyArea(p: Pt[]) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    a += p[i]!.x * p[j]!.y - p[j]!.x * p[i]!.y;
  }
  return Math.abs(a) / 2;
}

/**
 * Try to snap a perspective quad to the wall edges around `box`.
 * Returns null when the edges don't make a believable shape.
 */
export function quadInBox(img: Rgb, box: Rect): [Pt, Pt, Pt, Pt] | null {
  const { w: gw, h: gh } = img;
  const data = luma(img);
  // Search region: the box plus a 12% margin, in pixels.
  const mx = box.w * 0.12;
  const my = box.h * 0.12;
  const rx0 = Math.max(1, Math.floor((box.x - mx) * gw));
  const ry0 = Math.max(1, Math.floor((box.y - my) * gh));
  const rx1 = Math.min(gw - 1, Math.ceil((box.x + box.w + mx) * gw));
  const ry1 = Math.min(gh - 1, Math.ceil((box.y + box.h + my) * gh));
  if (rx1 - rx0 < 16 || ry1 - ry0 < 16) return null;

  // Sobel magnitude inside the region.
  const mag = new Float32Array(gw * gh);
  let sum = 0;
  let n = 0;
  for (let y = ry0; y < ry1; y++) {
    for (let x = rx0; x < rx1; x++) {
      const i = y * gw + x;
      const gx = -data[i - gw - 1]! - 2 * data[i - 1]! - data[i + gw - 1]! + data[i - gw + 1]! + 2 * data[i + 1]! + data[i + gw + 1]!;
      const gy = -data[i - gw - 1]! - 2 * data[i - gw]! - data[i - gw + 1]! + data[i + gw - 1]! + 2 * data[i + gw]! + data[i + gw + 1]!;
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      sum += m;
      n++;
    }
  }
  const thresh = (sum / Math.max(1, n)) * 2.2;

  const bw = rx1 - rx0;
  const bh = ry1 - ry0;
  const H = Math.PI / 2; // normal points vertically → a horizontal edge
  const S = (25 * Math.PI) / 180;
  const top = bandLine(mag, gw, { x0: rx0, y0: ry0, x1: rx1, y1: ry0 + Math.round(bh * 0.4) }, H, S, thresh);
  const bottom = bandLine(mag, gw, { x0: rx0, y0: ry1 - Math.round(bh * 0.4), x1: rx1, y1: ry1 }, H, S, thresh);
  const left = bandLine(mag, gw, { x0: rx0, y0: ry0, x1: rx0 + Math.round(bw * 0.4), y1: ry1 }, 0, S, thresh);
  const right = bandLine(mag, gw, { x0: rx1 - Math.round(bw * 0.4), y0: ry0, x1: rx1, y1: ry1 }, 0, S, thresh);
  if (!top || !bottom || !left || !right) return null;

  // A line needs real support: at least ~45% of its band's length in edges.
  const minVotes = (len: number) => len * thresh * 0.45;
  if (top.votes < minVotes(bw) || bottom.votes < minVotes(bw) || left.votes < minVotes(bh) || right.votes < minVotes(bh)) return null;

  const tl = intersect(top, left);
  const tr = intersect(top, right);
  const br = intersect(bottom, right);
  const bl = intersect(bottom, left);
  if (!tl || !tr || !br || !bl) return null;
  const pts = [tl, tr, br, bl].map((p) => ({ x: p.x / gw, y: p.y / gh })) as [Pt, Pt, Pt, Pt];

  // Believable: convex, inside the search region, 45–140% of the box area.
  if (!convex(pts)) return null;
  const inside = pts.every((p) => p.x >= box.x - mx * 1.2 && p.x <= box.x + box.w + mx * 1.2 && p.y >= box.y - my * 1.2 && p.y <= box.y + box.h + my * 1.2);
  if (!inside) return null;
  const ratio = polyArea(pts) / Math.max(1e-6, box.w * box.h);
  if (ratio < 0.45 || ratio > 1.4) return null;
  return pts;
}

/**
 * Shrink a box to where the paint is. Crop scoring is coarse (half-frame
 * crops), so lettering on a plain wall gets a box the size of the wall.
 * Only when the box border is one plain colour (a wall): that colour is the
 * median of the border, then every
 * pixel is scored by how far its colour is from the wall; pixels well above
 * the typical distance count as paint. The box becomes the span holding the
 * middle ~94% of the paint on each axis. Never shrinks below 30% of a side.
 */
export function tightenBox(img: Rgb, box: Rect): Rect {
  const { w: gw, h: gh, data } = img;
  const x0 = Math.max(0, Math.floor(box.x * gw));
  const y0 = Math.max(0, Math.floor(box.y * gh));
  const x1 = Math.min(gw, Math.ceil((box.x + box.w) * gw));
  const y1 = Math.min(gh, Math.ceil((box.y + box.h) * gh));
  if (x1 - x0 < 8 || y1 - y0 < 8) return box;

  // Wall colour: median of the box's 2-px border.
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const take = (x: number, y: number) => {
    const i = (y * gw + x) * 3;
    rs.push(data[i]!);
    gs.push(data[i + 1]!);
    bs.push(data[i + 2]!);
  };
  for (let x = x0; x < x1; x++) for (const y of [y0, y0 + 1, y1 - 2, y1 - 1]) take(x, y);
  for (let y = y0; y < y1; y++) for (const x of [x0, x0 + 1, x1 - 2, x1 - 1]) take(x, y);
  const med = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1]!;
  const wr = med(rs);
  const wg = med(gs);
  const wb = med(bs);

  // Tightening assumes art on a plain wall. If the border itself isn't one
  // colour (the art or other buildings reach the edge), there's no "wall"
  // to subtract — keep the box.
  const borderDist = rs.map((r, i) => Math.hypot(r - wr, gs[i]! - wg, bs[i]! - wb)).sort((a, b) => a - b);
  if (borderDist[Math.floor(borderDist.length * 0.75)]! > 30) return box;

  const dist = new Float32Array((x1 - x0) * (y1 - y0));
  let k = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * gw + x) * 3;
      dist[k++] = Math.hypot(data[i]! - wr, data[i + 1]! - wg, data[i + 2]! - wb);
    }
  }
  const sorted = Float32Array.from(dist).sort();
  // "Paint" = clearly further from the wall colour than the typical pixel.
  const cut = Math.max(45, sorted[Math.floor(sorted.length * 0.5)]! * 2.2);

  const bw = x1 - x0;
  const bh = y1 - y0;
  const col = new Float32Array(bw);
  const row = new Float32Array(bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (dist[y * bw + x]! >= cut) {
        col[x]! += 1;
        row[y]! += 1;
      }
    }
  }
  const span = (v: Float32Array) => {
    const total = v.reduce((a, b) => a + b, 0);
    if (total < 12) return null;
    let acc = 0;
    let lo = 0;
    while (lo < v.length - 1 && acc + v[lo]! < total * 0.03) acc += v[lo++]!;
    acc = 0;
    let hi = v.length;
    while (hi > lo + 1 && acc + v[hi - 1]! < total * 0.03) acc += v[--hi]!;
    return [lo, hi] as const;
  };
  const sx = span(col);
  const sy = span(row);
  if (!sx || !sy) return box;
  const nw = Math.max(bw * 0.3, sx[1] - sx[0]);
  const nh = Math.max(bh * 0.3, sy[1] - sy[0]);

  // Only trust it when it clearly separates paint from wall: the new box
  // must drop real area AND hold paint ≥3× denser than what it leaves out.
  // (When the art fills the box, the "wall colour" is really art colour and
  // this test fails — we keep the original box.)
  let inside = 0;
  let total = 0;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (dist[y * bw + x]! < cut) continue;
      total++;
      if (x >= sx[0] && x < sx[0] + nw && y >= sy[0] && y < sy[0] + nh) inside++;
    }
  }
  const areaIn = nw * nh;
  const areaOut = bw * bh - areaIn;
  if (areaIn > bw * bh * 0.8 || areaOut <= 0) return box;
  const densIn = inside / areaIn;
  const densOut = (total - inside) / areaOut;
  if (densIn < densOut * 3) return box;
  // Pad a little so the outline sits just outside the paint.
  const px = nw * 0.06;
  const py = nh * 0.06;
  const nx = Math.max(0, (x0 + sx[0] - px) / gw);
  const ny = Math.max(0, (y0 + sy[0] - py) / gh);
  return { x: nx, y: ny, w: Math.min(1 - nx, (nw + 2 * px) / gw), h: Math.min(1 - ny, (nh + 2 * py) / gh) };
}

/** Box → tightened → quad when the edges agree, else the tightened box. */
export function outlineFor(img: Rgb | null, box: Rect): Outline {
  if (!img) return { kind: "box", rect: box };
  const q = quadInBox(img, box);
  if (q) return { kind: "quad", pts: q };
  return { kind: "box", rect: tightenBox(img, box) };
}

/** Corners of any outline (clockwise from top-left), for drawing and tweening. */
export function corners(o: Outline): [Pt, Pt, Pt, Pt] {
  if (o.kind === "quad") return o.pts;
  const { x, y, w, h } = o.rect;
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}
