import { useColorScheme } from "react-native";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { persistStorage } from "~/lib/storage";
import type { Rarity } from "~/lib/ar/types";
import { palettes, type TokenName } from "./tokens";

/**
 * ── Theme ──────────────────────────────────────────────────────────────────
 *
 * Same three-way preference as the web's Profile → Appearance
 * (`wadzzoAR/src/lib/ar/theme.ts`): System, Light, Dark. "System" follows the
 * OS live. The resolved scheme picks one of the two generated palettes.
 */

export type ThemePreference = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

interface ThemeState {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

export const useThemePreference = create<ThemeState>()(
  persist(
    (set) => ({
      preference: "auto",
      setPreference: (preference) => set({ preference }),
    }),
    { name: "wadzzo-theme", storage: persistStorage },
  ),
);

export function useResolvedTheme(): ResolvedTheme {
  const system = useColorScheme();
  const preference = useThemePreference((s) => s.preference);
  if (preference === "auto") return system === "dark" ? "dark" : "light";
  return preference;
}

/** Same values as the web's `MAP_STYLE`. */
export const MAP_STYLE: Record<ResolvedTheme, string> = {
  // "Wadzzo 3D Dark/Light" (Mapbox Standard + Wadzzo colour theme) — see
  // wadzzoAR/docs/map-style.md.
  dark: "mapbox://styles/wadzzo/cmuwbonsf00rv01sdcun4fhdu",
  light: "mapbox://styles/wadzzo/cmuwc16ut00gz01sd6359b3sw",
};

/**
 * ── Map mode: 2D / 3D ──────────────────────────────────────────────────────
 *
 * Same as the web's `useMapMode` (`wadzzoAR/src/lib/ar/theme.ts`). "2d" is the
 * default: a flat Mapbox Light / Dark basemap seen straight down. "3d" is the
 * Wadzzo 3D style above (Mapbox Standard with 3D buildings), tilted. One
 * choice per device, shared by every map in the app.
 */
export type MapMode = "2d" | "3d";

interface MapModeState {
  mode: MapMode;
  setMode: (m: MapMode) => void;
}

export const useMapModeStore = create<MapModeState>()(
  persist(
    (set) => ({
      mode: "2d",
      setMode: (mode) => set({ mode }),
    }),
    { name: "wadzzo-map-mode", storage: persistStorage },
  ),
);

export const MAP_STYLE_2D: Record<ResolvedTheme, string> = {
  dark: "mapbox://styles/mapbox/dark-v11",
  light: "mapbox://styles/mapbox/light-v11",
};

/** The basemap style for a mode + live theme. */
export function mapStyleFor(mode: MapMode, theme: ResolvedTheme): string {
  return mode === "3d" ? MAP_STYLE[theme] : MAP_STYLE_2D[theme];
}

/** The shared 2D/3D choice and its setter. */
export function useMapMode(): { mode: MapMode; is3d: boolean; setMode: (m: MapMode) => void; toggle: () => void } {
  const mode = useMapModeStore((s) => s.mode);
  const setMode = useMapModeStore((s) => s.setMode);
  return { mode, is3d: mode === "3d", setMode, toggle: () => setMode(mode === "3d" ? "2d" : "3d") };
}

/**
 * Raw colours for code that can't take a className — Mapbox layers, Skia,
 * Viro materials, SVG strokes, status bar.
 */
export function useColors() {
  const theme = useResolvedTheme();
  const p = palettes[theme];
  const rgba = (name: TokenName, alpha = 1) => {
    const [r, g, b] = p[name];
    return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  return {
    theme,
    c: rgba,
    rarity: (r: Rarity, alpha = 1) => rgba(`rarity-${r}` as TokenName, alpha),
  };
}
