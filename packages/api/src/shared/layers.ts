import type { Db, Prisma } from "@wadzzo/db";
import { AppError, ErrorCodes } from "@wadzzo/errors";
import type { PinLayerRef } from "@wadzzo/schemas/layer";

/**
 * Map layers (docs/layers). A brand makes its own layers; with one selected on its base map,
 * the pins, hotspots and trails it makes go in it. Each is in at most one layer. The fan map
 * shows regular (layer-less) ones until a fan picks a layer's chip.
 */

/** The columns a fan client gets about a layer. */
export const LAYER_REF_SELECT = { id: true, name: true, icon: true, color: true } as const;

/**
 * Checks the layer a brand wants a pin, hotspot or trail in. Returns what to store: `undefined`
 * = leave the column alone (the input left it out), `null` = no layer, else the layer id.
 * Throws for a layer that isn't the brand's own (or no longer exists), unless it's `keep`, the
 * layer the row already has.
 */
export async function checkLayer(
  db: Pick<Db, "pinLayer">,
  creatorId: string,
  layerId: string | null | undefined,
  keep?: string | null,
): Promise<string | null | undefined> {
  if (layerId === undefined || layerId === null) return layerId;
  if (keep && layerId === keep) return layerId;
  const layer = await db.pinLayer.findUnique({
    where: { id: layerId },
    select: { creatorId: true },
  });
  if (layer?.creatorId !== creatorId)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: "That map layer isn't one of this brand's. Pick another or choose No layer.",
    });
  return layerId;
}

/**
 * Turns the fan map's `layer` filter into a where-clause on LocationGroup.
 * - undefined: no filter (every pin, what the App Store mobile app gets)
 * - "none": regular pins only
 * - "id" or "id1,id2": only those layers' pins
 */
export function layerFilterWhere(layer: string | undefined): Prisma.LocationGroupWhereInput {
  if (layer === undefined) return {};
  if (layer === "none") return { layerId: null };
  const ids = layer
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
  return ids.length ? { layerId: { in: ids } } : { layerId: null };
}

/** A fan-map chip: one brand's layer, with its brand's name and how many live drops it has. */
export type MapLayerChip = PinLayerRef & {
  brand: string;
  /** The brand's logo, for the fan map's layer list (added later; older clients ignore it). */
  brandImage: string | null;
  pinCount: number;
};

/**
 * The layer chips for the fan map: layers with at least one live pin in `where` (the map's own
 * live-pin filter), one chip per brand layer (two brands' "Hospital" are two chips), by name and
 * then brand.
 */
export async function mapLayerChips(
  db: Pick<Db, "pinLayer" | "locationGroup">,
  where: Prisma.LocationGroupWhereInput,
): Promise<MapLayerChip[]> {
  const counts = await db.locationGroup.groupBy({
    by: ["layerId"],
    where: { ...where, layerId: { not: null } },
    _count: { _all: true },
  });
  const countOf = new Map(counts.map((c) => [c.layerId!, c._count._all]));
  if (!countOf.size) return [];
  const layers = await db.pinLayer.findMany({
    where: { id: { in: [...countOf.keys()] } },
    select: { ...LAYER_REF_SELECT, creator: { select: { name: true, profileUrl: true } } },
  });
  return layers
    .map(({ creator, ...l }) => ({
      ...l,
      brand: creator.name,
      brandImage: creator.profileUrl ?? null,
      pinCount: countOf.get(l.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
        a.brand.localeCompare(b.brand, undefined, { sensitivity: "base" }),
    );
}
