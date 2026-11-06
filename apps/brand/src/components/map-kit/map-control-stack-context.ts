import { createContext, useContext } from "react";

import type { MapControlStack } from "./map-control-stack";

export const MapControlStackContext = createContext<MapControlStack | null>(null);

/** The map's corner button stack, for layers that add a button of their own (null when the map has none). */
export function useMapControlStack() {
  return useContext(MapControlStackContext);
}
