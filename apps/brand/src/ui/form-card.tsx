"use client";

import { createContext, useContext } from "react";

/**
 * A pin or hotspot form opened as a floating card on the base map (docs/layers), like the trail
 * builder, instead of as its own page. The same page components read this: with a card they
 * close it instead of navigating, leave out the side map (the base map is right there), and take
 * the location from map clicks (`at`).
 */
export type FormCard = {
  /** Cancel or the X. */
  onClose: () => void;
  /** Saved: close the card (the map refreshes its pins). */
  onDone: () => void;
  /** The spot last clicked on the base map, for a new pin. */
  at?: { lat: number; lng: number } | null;
  /** The layer picked on the map: what a new pin or hotspot starts in. */
  layerId?: string | null;
  /**
   * The brand an admin is acting for (Admin › All maps), or undefined on the brand's own map.
   * The form then uses that brand's tokens, tiers, shapes and layers, and saves for it.
   */
  brand?: ActingBrand;
};

/** A brand an admin picked to work on its map. */
export type ActingBrand = { id: string; name: string; profileUrl: string | null };

const FormCardContext = createContext<FormCard | null>(null);
export const FormCardProvider = FormCardContext.Provider;

/** The card this form is open in, or null on its own page. */
export function useFormCard() {
  return useContext(FormCardContext);
}
