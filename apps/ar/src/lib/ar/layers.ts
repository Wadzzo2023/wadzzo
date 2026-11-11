import { create } from "zustand";

import type { ArMapLayer, ArPin } from "@wadzzo/ar-core/ar/types";

import { api } from "~/utils/api";

/**
 * Which drops the fan map shows (docs/layers): the regular (layer-less) ones, and any brand
 * layers the fan ticked in the Layers sheet; several can be on at once. Regular drops are on
 * and every layer off by default. The map and the AR scene read the same choice, so they never
 * disagree about which drops are there.
 *
 * Not persisted: the map always opens on regular drops.
 */
export type LayerView = { regular: boolean; layers: readonly string[] };

export const DEFAULT_LAYER_VIEW: LayerView = { regular: true, layers: [] };

export const useMapLayer = create<{
  view: LayerView;
  toggleRegular: () => void;
  toggleLayer: (id: string) => void;
  /** Select all (regular + these layers) or deselect all. */
  setAll: (on: boolean, ids: readonly string[]) => void;
  /** Make sure a drop in this layer (null = regular) is shown: a search result, say. */
  reveal: (layerId: string | null) => void;
  /** Forget layers that no longer have live drops (no chip any more). */
  keepOnly: (ids: readonly string[]) => void;
}>()((set) => ({
  view: DEFAULT_LAYER_VIEW,
  toggleRegular: () => set((s) => ({ view: { ...s.view, regular: !s.view.regular } })),
  toggleLayer: (id) =>
    set((s) => ({
      view: {
        ...s.view,
        layers: s.view.layers.includes(id)
          ? s.view.layers.filter((l) => l !== id)
          : [...s.view.layers, id],
      },
    })),
  setAll: (on, ids) => set({ view: { regular: on, layers: on ? [...ids] : [] } }),
  reveal: (layerId) =>
    set((s) =>
      layerId === null
        ? s.view.regular
          ? s
          : { view: { ...s.view, regular: true } }
        : s.view.layers.includes(layerId)
          ? s
          : { view: { ...s.view, layers: [...s.view.layers, layerId] } },
    ),
  keepOnly: (ids) =>
    set((s) => {
      const layers = s.view.layers.filter((l) => ids.includes(l));
      return layers.length === s.view.layers.length ? s : { view: { ...s.view, layers } };
    }),
}));

const NO_LAYERS: ArMapLayer[] = [];

/**
 * The layers fans can turn on: brands' layers with live pins near them, by name. `loaded` is false until the
 * first answer (so a picked layer isn't dropped while the row is loading).
 */
export function useMapLayers(): { layers: ArMapLayer[]; loaded: boolean } {
  const query = api.pins.layers.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });
  return { layers: query.data ?? NO_LAYERS, loaded: query.data !== undefined };
}

/** Whether a pin shows on the map for `view`. */
export function inLayer(pin: Pick<ArPin, "layer">, view: LayerView): boolean {
  return pin.layer ? view.layers.includes(pin.layer.id) : view.regular;
}

/**
 * Same for a trail line. A server without layers sends no `layerId`, so every trail counts as
 * regular.
 */
export function trailInLayer(trail: { layerId?: string | null }, view: LayerView): boolean {
  return trail.layerId ? view.layers.includes(trail.layerId) : view.regular;
}

/** How many layers are on (for the Layers button's badge), not counting regular drops. */
export function layersOn(view: LayerView): number {
  return view.layers.length;
}

/**
 * A layer's name, plus its brand when another brand's layer has the same name
 * ("Hospital · Acme" beside "Hospital · Zed").
 */
export function chipLabels(layers: ArMapLayer[]) {
  const seen = new Map<string, number>();
  for (const l of layers) {
    const k = l.name.trim().toLowerCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return (l: ArMapLayer) =>
    l.brand && (seen.get(l.name.trim().toLowerCase()) ?? 0) > 1 ? `${l.name} · ${l.brand}` : l.name;
}
