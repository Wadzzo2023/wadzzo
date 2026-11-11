import type { z } from "zod";
import { create } from "zustand";

import type { createPinFormSchema } from "~/components/pins/pin-form-parts";

type PinForm = z.input<typeof createPinFormSchema>;

/** What the next new pin starts from: everything but where it goes. */
export type LastPin = {
  values: Omit<PinForm, "lat" | "lng" | "layerId">;
  mode: "manual" | "auto";
  /** The brand an admin made it for (Admin › All maps); undefined = the signed-in brand. */
  brandId?: string;
};

/**
 * The last pin made from a card on the base map (docs/layers). The next new-pin card starts
 * from it, so a run of similar pins is quick; the card has Clear to start blank. Kept for the
 * session only (in memory).
 */
export const useLastPin = create<{
  last: LastPin | null;
  remember: (pin: LastPin) => void;
  forget: () => void;
}>((set) => ({
  last: null,
  remember: (last) => set({ last }),
  forget: () => set({ last: null }),
}));
