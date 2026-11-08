/**
 * Grouping many map points for display, so a map with thousands of pins draws a few
 * hundred things instead of thousands.
 *
 * Build one `PointIndex` per list of points (that is the slow part, done once), then
 * `query` it whenever the view changes: it returns only what is in view, with points
 * that would overlap on screen grouped into one cluster each. Pure, no map library.
 */

export type ViewBounds = { west: number; south: number; east: number; north: number };

/** A single point left on its own. */
export type SinglePoint<T> = { type: "point"; key: string; item: T; lat: number; lng: number };

/** Several points close together on screen, drawn as one mark at their average position. */
export type PointCluster<T> = {
  type: "cluster";
  key: string;
  lat: number;
  lng: number;
  count: number;
  /** The extent of the points in it, to zoom to them. */
  bounds: ViewBounds;
  /** A few of its points, each different by the `sample.by` you asked for (empty when not asked). */
  sample: T[];
};

export type ClusterResult<T> = SinglePoint<T> | PointCluster<T>;

/** Mapbox's world is 512 px wide at zoom 0. */
const WORLD = 512;
const MAX_LAT = 85.0511;

/** Web Mercator, as a 0–1 world position. */
function project(lat: number, lng: number): [number, number] {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return [lng / 360 + 0.5, 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)];
}

export class PointIndex<T> {
  private readonly xs: Float64Array;
  private readonly ys: Float64Array;
  private readonly lats: Float64Array;
  private readonly lngs: Float64Array;

  constructor(
    private readonly items: readonly T[],
    where: (item: T) => { lat: number; lng: number },
    private readonly idOf: (item: T) => string,
  ) {
    const n = items.length;
    this.xs = new Float64Array(n);
    this.ys = new Float64Array(n);
    this.lats = new Float64Array(n);
    this.lngs = new Float64Array(n);
    items.forEach((item, i) => {
      const { lat, lng } = where(item);
      const [x, y] = project(lat, lng);
      this.xs[i] = x;
      this.ys[i] = y;
      this.lats[i] = lat;
      this.lngs[i] = lng;
    });
  }

  get size() {
    return this.items.length;
  }

  /**
   * What to draw for the points inside `bounds` at `zoom`. Points within `radius` screen
   * pixels of each other (measured on a grid) become a cluster; from `clusterMaxZoom` up
   * nothing is clustered. Results are in a steady order, so keys stay the same as the
   * view moves.
   */
  query(
    bounds: ViewBounds,
    zoom: number,
    {
      radius = 56,
      clusterMaxZoom = 16,
      sample,
    }: {
      radius?: number;
      clusterMaxZoom?: number;
      /** Also give each cluster up to `size` of its points that differ by `by` (e.g. their image). */
      sample?: { size: number; by: (item: T) => string | null | undefined };
    } = {},
  ): ClusterResult<T>[] {
    const scale = WORLD * 2 ** zoom;
    const cell = radius / scale; // grid cell, in world units
    // A margin of one cell, so markers just outside the screen don't pop in at the edge.
    const [x0, y1] = project(bounds.south, bounds.west);
    const [x1, y0] = project(bounds.north, bounds.east);
    const wraps = bounds.east - bounds.west >= 360;
    const minX = wraps ? 0 : x0 - cell;
    const maxX = wraps ? 1 : x1 + cell;
    const minY = y0 - cell;
    const maxY = y1 + cell;

    const out: ClusterResult<T>[] = [];
    const noClusters = zoom >= clusterMaxZoom;
    const cells = new Map<number, number[]>();
    for (let i = 0; i < this.xs.length; i++) {
      const x = this.xs[i]!;
      const y = this.ys[i]!;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      if (noClusters) {
        out.push(this.single(i));
        continue;
      }
      const key = Math.floor(x / cell) * 1_000_003 + Math.floor(y / cell);
      const members = cells.get(key);
      if (members) members.push(i);
      else cells.set(key, [i]);
    }
    for (const members of this.mergeNeighbours([...cells.values()], cell)) {
      if (members.length === 1) out.push(this.single(members[0]!));
      else out.push(this.group(members, sample));
    }
    return out;
  }

  /**
   * Two neighbouring grid cells can each make a group whose marks overlap on screen. Groups
   * whose middles are closer than one cell (the cluster radius) are joined into one.
   */
  private mergeNeighbours(groups: number[][], cell: number): number[][] {
    if (groups.length < 2) return groups;
    const mid = groups.map((g) => {
      let x = 0;
      let y = 0;
      for (const i of g) {
        x += this.xs[i]!;
        y += this.ys[i]!;
      }
      return [x / g.length, y / g.length] as const;
    });
    const at = new Map<number, number>();
    mid.forEach(([x, y], k) => at.set(Math.floor(x / cell) * 1_000_003 + Math.floor(y / cell), k));
    const parent = groups.map((_, k) => k);
    const find = (k: number): number => {
      while (parent[k] !== k) {
        parent[k] = parent[parent[k]!]!;
        k = parent[k]!;
      }
      return k;
    };
    mid.forEach(([x, y], k) => {
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const other = at.get((cx + dx) * 1_000_003 + (cy + dy));
          if (other === undefined || other <= k) continue;
          const [ox, oy] = mid[other]!;
          if (Math.hypot(ox - x, oy - y) < cell) parent[find(other)] = find(k);
        }
      }
    });
    const merged = new Map<number, number[]>();
    groups.forEach((g, k) => {
      const root = find(k);
      const into = merged.get(root);
      if (into) into.push(...g);
      else merged.set(root, [...g]);
    });
    return [...merged.values()];
  }

  private single(i: number): SinglePoint<T> {
    const item = this.items[i]!;
    return { type: "point", key: this.idOf(item), item, lat: this.lats[i]!, lng: this.lngs[i]! };
  }

  private group(
    members: number[],
    sample?: { size: number; by: (item: T) => string | null | undefined },
  ): PointCluster<T> {
    let lat = 0;
    let lng = 0;
    let west = Infinity;
    let east = -Infinity;
    let south = Infinity;
    let north = -Infinity;
    let firstId = this.idOf(this.items[members[0]!]!);
    for (const i of members) {
      lat += this.lats[i]!;
      lng += this.lngs[i]!;
      west = Math.min(west, this.lngs[i]!);
      east = Math.max(east, this.lngs[i]!);
      south = Math.min(south, this.lats[i]!);
      north = Math.max(north, this.lats[i]!);
      // The smallest id names the cluster, so its key doesn't change as the view moves.
      const id = this.idOf(this.items[i]!);
      if (id < firstId) firstId = id;
    }
    const picked: T[] = [];
    if (sample) {
      const seen = new Set<string>();
      for (const i of members) {
        if (picked.length >= sample.size) break;
        const item = this.items[i]!;
        const by = sample.by(item);
        if (!by || seen.has(by)) continue;
        seen.add(by);
        picked.push(item);
      }
    }
    return {
      type: "cluster",
      key: `c:${firstId}:${members.length}`,
      lat: lat / members.length,
      lng: lng / members.length,
      count: members.length,
      bounds: { west, south, east, north },
      sample: picked,
    };
  }
}
