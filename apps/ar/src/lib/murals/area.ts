/**
 * The box `murals.inArea` is asked for, from a map's view. Rounded out to ~1 km so a nudge of the
 * map doesn't refetch, and kept inside what the API accepts: latitudes within ±90 and longitudes
 * within ±180. Zoomed far out (the globe), a view can run past the date line (east 203°) or be
 * wider than the world; the first wraps round (west > east: the server reads it as crossing the
 * line), the second becomes the whole world.
 */
export type MuralBox = { north: number; south: number; east: number; west: number };

// Rounded to 1e-9 so wrapping doesn't turn 44.4 into 44.3999… (which would then round down).
const wrap = (lng: number) => Math.round((((((lng + 180) % 360) + 360) % 360) - 180) * 1e9) / 1e9;
const up = (v: number) => Math.ceil(v * 100) / 100;
const down = (v: number) => Math.floor(v * 100) / 100;

export function muralQueryBox(b: MuralBox): MuralBox {
  const north = Math.min(90, up(b.north));
  const south = Math.max(-90, down(b.south));
  if (b.east - b.west >= 360) return { north, south, east: 180, west: -180 };
  return {
    north,
    south,
    east: Math.min(180, up(wrap(b.east))),
    west: Math.max(-180, down(wrap(b.west))),
  };
}
