import { create } from "zustand";

import { api, type RouterOutputs } from "~/utils/api";

/** The key for the regular map (no layer) in `shown`. */
export const REGULAR = "none";

/**
 * The layer picked on the base map (docs/layers): the one the brand is "in". The map shows its
 * pins, hotspots and trails, and new ones are made in it. Null = "No layer": the regular map.
 *
 * `shown` are other layers switched on with their eye (REGULAR for the regular map), shown
 * alongside it so the brand can see several at once; what's made still goes in `id`. All off by
 * default. Not saved: the map always opens on No layer with nothing else shown.
 */
export const useSelectedLayer = create<{
  id: string | null;
  shown: string[];
  set: (id: string | null) => void;
  toggleShown: (key: string) => void;
  reset: () => void;
}>((set) => ({
  id: null,
  shown: [],
  set: (id) => set({ id }),
  toggleShown: (key) =>
    set((s) => ({
      shown: s.shown.includes(key) ? s.shown.filter((k) => k !== key) : [...s.shown, key],
    })),
  reset: () => set({ id: null, shown: [] }),
}));

export type BrandLayer = RouterOutputs["maps"]["layer"]["list"][number];

/** The brand's layers, by name (shared by the switcher, the forms and the trail builder). */
export function useBrandLayers(creatorId?: string) {
  return api.maps.layer.list.useQuery(creatorId ? { creatorId } : undefined, {
    staleTime: 30_000,
  });
}

/**
 * True when a pin, hotspot or trail with this `layerId` belongs on the map: it's in the layer
 * the brand is in (`selected`), or in one switched on with its eye (`shown`).
 */
export function onSelectedLayer(
  layerId: string | null | undefined,
  selected: string | null,
  shown: readonly string[] = [],
) {
  const id = layerId ?? null;
  return id === selected || shown.includes(id ?? REGULAR);
}
