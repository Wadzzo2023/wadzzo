import { create } from "zustand";

/** Which form is open as a floating card on the base map (docs/layers). */
export type MapFormCard =
  | { kind: "newPin" }
  | { kind: "editPin"; id: string }
  | { kind: "newHotspot" }
  | { kind: "editHotspot"; id: string };

/**
 * The base map's form card. `hosted` is true while the map is on screen: the pin and hotspot
 * details open their Edit there instead of going to the edit page.
 */
export const useMapFormCard = create<{
  hosted: boolean;
  card: MapFormCard | null;
  /** The last spot clicked on the map while a card is open (where a pin goes). */
  at: { lat: number; lng: number } | null;
  setHosted: (hosted: boolean) => void;
  open: (card: MapFormCard, at?: { lat: number; lng: number } | null) => void;
  moveTo: (at: { lat: number; lng: number }) => void;
  close: () => void;
}>((set) => ({
  hosted: false,
  card: null,
  at: null,
  setHosted: (hosted) => set(hosted ? { hosted } : { hosted, card: null, at: null }),
  open: (card, at = null) => set({ card, at }),
  moveTo: (at) => set({ at }),
  close: () => set({ card: null, at: null }),
}));
