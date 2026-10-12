/**
 * ── Coin mesh ──────────────────────────────────────────────────────────────
 *
 * Built procedurally for `ViroGeometry`: two circular faces UV-mapped to the
 * pin's image (centre-cropped square, like the web's coin face) and a rim.
 * Element 0 = faces (material: pin art), element 1 = rim (material: rarity
 * colour). Sizes mirror the web's `ArPinObject3D`: radius 1.35 m, 0.26 m
 * thick.
 */

export const PIN_RADIUS_M = 1.35;
export const PIN_THICKNESS_M = 0.26;
export const PIN_FLOAT_HEIGHT_M = 0.85;

type V3 = [number, number, number];
type V2 = [number, number];

export type CoinMesh = {
  vertices: V3[];
  normals: V3[];
  texcoords: V2[];
  triangleIndices: number[][];
};

export function buildCoin(segments = 48, radius = PIN_RADIUS_M, thickness = PIN_THICKNESS_M): CoinMesh {
  const vertices: V3[] = [];
  const normals: V3[] = [];
  const texcoords: V2[] = [];
  const faces: number[] = [];
  const rim: number[] = [];
  const h = thickness / 2;

  // Faces: a centre vertex + ring, front (+Z) and back (−Z).
  for (const side of [1, -1] as const) {
    const centre = vertices.length;
    vertices.push([0, 0, side * h]);
    normals.push([0, 0, side]);
    texcoords.push([0.5, 0.5]);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius;
      vertices.push([x, y, side * h]);
      normals.push([0, 0, side]);
      // Back face mirrors U so the art reads the right way round from behind.
      texcoords.push([0.5 + (side === 1 ? 1 : -1) * (x / radius) * 0.5, 0.5 - (y / radius) * 0.5]);
    }
    for (let i = 0; i < segments; i++) {
      const a = centre + 1 + i;
      const b = centre + 2 + i;
      if (side === 1) faces.push(centre, a, b);
      else faces.push(centre, b, a);
    }
  }

  // Rim: a band of quads with outward normals.
  const rimStart = vertices.length;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    vertices.push([nx * radius, ny * radius, h], [nx * radius, ny * radius, -h]);
    normals.push([nx, ny, 0], [nx, ny, 0]);
    texcoords.push([i / segments, 0], [i / segments, 1]);
  }
  for (let i = 0; i < segments; i++) {
    const f0 = rimStart + i * 2;
    const b0 = f0 + 1;
    const f1 = f0 + 2;
    const b1 = f0 + 3;
    rim.push(f0, b0, f1, f1, b0, b1);
  }

  return { vertices, normals, texcoords, triangleIndices: [faces, rim] };
}
