import { useQuery } from "@tanstack/react-query";
import {
  Baby,
  Beer,
  Bike,
  BookOpen,
  Building2,
  Bus,
  Camera,
  Church,
  Coffee,
  Dog,
  Dumbbell,
  Flag,
  Fuel,
  GraduationCap,
  HeartPulse,
  Hospital,
  Hotel,
  Landmark,
  MapPin,
  Music,
  Palette,
  Pill,
  School,
  ShieldPlus,
  ShoppingBag,
  Siren,
  SquareParking,
  Star,
  Stethoscope,
  Store,
  Tent,
  Ticket,
  TrainFront,
  Trees,
  Trophy,
  Utensils,
  Volleyball,
  Waves,
  type LucideIcon,
} from "lucide-react-native";
import { create } from "zustand";

import { api } from "~/lib/api/client";
import type { PinArea } from "~/lib/api/queries";

import type { ArMapLayer, ArPin } from "./types";

/**
 * Map layers (docs/layers). Brands make their own (Hospital, School…) on their base map and put
 * drops in one. The map shows regular (layer-less) drops by default; in the Layers sheet the fan
 * turns layers on (several at once) and regular drops off. The map and the AR camera read the
 * same choice. Not persisted: the map always opens on regular drops.
 *
 * Works with an older server too: pins without a `layer` field count as regular, and a failed
 * `/layers` request just means an empty list.
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
  /** Forget layers that no longer have live drops here. */
  keepOnly: (ids: readonly string[]) => void;
}>()((set) => ({
  view: DEFAULT_LAYER_VIEW,
  toggleRegular: () => set((s) => ({ view: { ...s.view, regular: !s.view.regular } })),
  toggleLayer: (id) =>
    set((s) => ({
      view: { ...s.view, layers: s.view.layers.includes(id) ? s.view.layers.filter((l) => l !== id) : [...s.view.layers, id] },
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
 * The layers fans can turn on: brands' layers with live pins in the area, by name. `loaded` is
 * false until the first answer (so a picked layer isn't dropped while the row is loading).
 */
export function useMapLayers(area: PinArea | null): { layers: ArMapLayer[]; loaded: boolean } {
  const q = useQuery({
    queryKey: ["layers", area] as const,
    queryFn: ({ signal }) =>
      api<ArMapLayer[]>(
        area && area !== "world" ? `/layers?lat=${area.lat}&lng=${area.lng}&radiusKm=${area.radiusKm}` : "/layers",
        { signal },
      ).catch(() => NO_LAYERS),
    enabled: area != null,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { layers: q.data ?? NO_LAYERS, loaded: q.data !== undefined };
}

/** Whether a pin shows on the map for `view`. */
export function inLayer(pin: Pick<ArPin, "layer">, view: LayerView): boolean {
  return pin.layer ? view.layers.includes(pin.layer.id) : view.regular;
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

/**
 * Layer icons by the names in LAYER_ICONS (packages/schemas/src/layer.ts). The web's table is
 * packages/ui/src/patterns/layer-icon.tsx; add an icon in all three.
 */
const ICONS: Record<string, LucideIcon> = {
  Hospital,
  Stethoscope,
  HeartPulse,
  Pill,
  School,
  GraduationCap,
  BookOpen,
  Trophy,
  Volleyball,
  Dumbbell,
  Bike,
  Utensils,
  Coffee,
  Beer,
  ShoppingBag,
  Store,
  Landmark,
  Church,
  Trees,
  Tent,
  Waves,
  Music,
  Ticket,
  Palette,
  Camera,
  Bus,
  TrainFront,
  SquareParking,
  Fuel,
  Hotel,
  Building2,
  Baby,
  Dog,
  Siren,
  ShieldPlus,
  Flag,
  Star,
  MapPin,
};

/** A layer's icon (an unknown name falls back to a map pin). */
export function layerIcon(name: string): LucideIcon {
  return ICONS[name] ?? MapPin;
}
