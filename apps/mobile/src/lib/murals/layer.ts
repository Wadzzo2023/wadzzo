import { create } from "zustand";
import { persist } from "zustand/middleware";

import { persistStorage } from "~/lib/storage";

/** Which murals the map shows: every one, verified only, or none. */
export type MuralLayer = "all" | "verified" | "off";

/**
 * Set in Profile › Settings › Murals on map, read by the map (it used to be a button on the map
 * that cycled through these). Its own store, apart from `useSettings`, whose fields are all on/off
 * switches — same split as the web (`useMuralLayer` in wadzzoAR's store).
 */
export const useMuralLayer = create<{ layer: MuralLayer; setLayer: (layer: MuralLayer) => void }>()(
  persist((set) => ({ layer: "all", setLayer: (layer) => set({ layer }) }), {
    name: "wadzzo-mural-layer",
    storage: persistStorage,
  }),
);
