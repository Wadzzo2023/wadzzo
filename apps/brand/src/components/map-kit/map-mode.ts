import { useSyncExternalStore } from "react";

/**
 * The portal's 2D / 3D map choice, shared by every map and kept per device.
 * "2d" (the default) is a flat Mapbox Light / Dark map; "3d" is the Wadzzo 3D
 * style (Mapbox Standard with 3D buildings), tilted.
 */
export type MapMode = "2d" | "3d";

export const MAP_MODE_STORAGE_KEY = "wadzzo-brand-map-mode";

export const MAP_STYLE_3D = {
  // "Wadzzo 3D Light/Dark" (Mapbox Standard + Wadzzo colour theme) — see
  // apps/ar/docs/map-style.md.
  light: "mapbox://styles/wadzzo/cmuwc16ut00gz01sd6359b3sw",
  dark: "mapbox://styles/wadzzo/cmuwbonsf00rv01sdcun4fhdu",
} as const;

export const MAP_STYLE_2D = {
  light: "mapbox://styles/mapbox/light-v11",
  dark: "mapbox://styles/mapbox/dark-v11",
} as const;

/**
 * The Layers panel's map types: "default" is the portal's own look (above); the others are
 * Mapbox's styles. Streets and Satellite have a 3D (Mapbox Standard) version; Outdoors, Light
 * and Dark are tilted flat in 3D. Terrain (hill shading, contours) goes over any of them.
 */
export const MAP_BASES = ["default", "streets", "outdoors", "satellite", "light", "dark"] as const;
export type MapBase = (typeof MAP_BASES)[number];

export const MAP_BASE_LABEL: Record<MapBase, string> = {
  default: "Default",
  streets: "Streets",
  outdoors: "Outdoors",
  satellite: "Satellite",
  light: "Light",
  dark: "Dark",
};

const MAPBOX_2D: Record<Exclude<MapBase, "default">, string> = {
  streets: "mapbox://styles/mapbox/streets-v12",
  outdoors: "mapbox://styles/mapbox/outdoors-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  light: "mapbox://styles/mapbox/light-v11",
  dark: "mapbox://styles/mapbox/dark-v11",
};

const MAPBOX_3D: Partial<Record<MapBase, string>> = {
  streets: "mapbox://styles/mapbox/standard",
  satellite: "mapbox://styles/mapbox/standard-satellite",
};

export function mapStyleFor(mode: MapMode, theme: "light" | "dark", base: MapBase = "default") {
  if (base === "default") return (mode === "3d" ? MAP_STYLE_3D : MAP_STYLE_2D)[theme];
  return (mode === "3d" ? MAPBOX_3D[base] : undefined) ?? MAPBOX_2D[base];
}

/** Mapbox Standard has slots: extra layers go in "bottom", under roads and labels. */
export function isStandardStyle(mode: MapMode, base: MapBase) {
  return mode === "3d" && (base === "default" || Boolean(MAPBOX_3D[base]));
}

const listeners = new Set<() => void>();
/** Holds the choice when localStorage is unavailable, so the toggle still works for the session. */
let memoryMode: MapMode | null = null;

export function readMapMode(): MapMode {
  if (memoryMode) return memoryMode;
  try {
    return window.localStorage.getItem(MAP_MODE_STORAGE_KEY) === "3d" ? "3d" : "2d";
  } catch {
    return "2d";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === MAP_MODE_STORAGE_KEY) {
      memoryMode = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setMapMode(mode: MapMode) {
  memoryMode = mode;
  try {
    window.localStorage.setItem(MAP_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
  listeners.forEach((l) => l());
}

/** "2d" on the server and until hydrated. */
export function useMapMode(): MapMode {
  return useSyncExternalStore<MapMode>(subscribe, readMapMode, () => "2d");
}

const noSubscribe = () => () => undefined;

/** False while rendering on the server and during hydration, true afterwards. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

/** A small stored choice, kept per device and shared live between every map. */
function storedChoice<T extends string>(key: string, fallback: T, valid: readonly T[]) {
  const subs = new Set<() => void>();
  let memory: T | null = null;
  const read = (): T => {
    if (memory) return memory;
    try {
      const v = window.localStorage.getItem(key) as T | null;
      return v && valid.includes(v) ? v : fallback;
    } catch {
      return fallback;
    }
  };
  const subscribeTo = (listener: () => void) => {
    subs.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        memory = null;
        listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      subs.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };
  const write = (v: T) => {
    memory = v;
    try {
      window.localStorage.setItem(key, v);
    } catch {
      // Storage blocked: the choice lasts until the page is closed.
    }
    subs.forEach((l) => l());
  };
  const use = () => useSyncExternalStore(subscribeTo, read, () => fallback);
  return { use, write };
}

const mapBase = storedChoice<MapBase>("wadzzo-brand-map-base", "default", MAP_BASES);
const mapTerrain = storedChoice<"on" | "off">("wadzzo-brand-map-terrain", "off", ["on", "off"]);

/** The map type every portal map uses. */
export const useMapBase = mapBase.use;
export const setMapBase = mapBase.write;
/** Hill shading and contour lines over the map. */
export const useMapTerrain = () => mapTerrain.use() === "on";
export const setMapTerrain = (on: boolean) => mapTerrain.write(on ? "on" : "off");
