import { useCallback, useEffect, useState } from "react";

/**
 * ── Theme ──────────────────────────────────────────────────────────────────
 *
 * Light/dark for the whole app — see the big doc comment at the top of
 * `arcade.css` for the full picture (why it exists, why `.dark` and not a
 * bespoke attribute, why the palettes aren't literal inversions of each
 * other). This file is the runtime half: where the choice is stored, how
 * "auto" resolves, and the hook the settings toggle drives.
 *
 * The other half is the inline script in `_document.tsx`'s `<Head>` — it has
 * to duplicate `STORAGE_KEY` and the resolve logic as a literal string,
 * since it runs before any module (this one included) has loaded. Keep the
 * two in sync by hand if either changes; there's no way to share the source
 * between a bundled module and a pre-hydration inline script without a build
 * step dedicated to it, which is a lot of machinery for four lines of logic.
 */

export type ThemePreference = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "wadzzo-ar-theme";

/** The two `theme-color` values — see the matching hex in `_document.tsx`. */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  dark: "#06100a",
  light: "#f5f9f7",
};

/**
 * Basemap style per theme, for every `react-map-gl` surface in the app (the
 * main map, the directions view, a collected card's mini-map).
 *
 * Declared once here rather than inline at each `<MapGL>`, because three
 * separate literals is three chances for one of them to keep showing a dark
 * basemap under light chrome — which is exactly the bug this fixes.
 */
export const MAP_STYLE: Record<ResolvedTheme, string> = {
  // "Wadzzo 3D Dark/Light" in Mapbox Studio (account: wadzzo) — Mapbox
  // Standard (3D buildings, landmarks, lighting) with a custom colour theme
  // generated from the arcade.css tokens (night / day light preset). Shared
  // by web, the mobile app and brand-wadzzo. Recipe: docs/map-style.md.
  dark: "mapbox://styles/wadzzo/cmuwbonsf00rv01sdcun4fhdu",
  light: "mapbox://styles/wadzzo/cmuwc16ut00gz01sd6359b3sw",
};

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "auto" || value === "light" || value === "dark";
}

/** Safe against SSR (no `window`) and a disabled/unavailable localStorage. */
export function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : "auto";
  } catch {
    return "auto";
  }
}

function writeStoredPreference(pref: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Private-browsing quota, or storage disabled entirely. The choice just
    // won't survive a reload — no worse than not having this feature at all,
    // and not worth surfacing an error over.
  }
}

function systemPrefersLight(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  );
}

/** "auto" resolved against the OS preference; "light"/"dark" pass through. */
export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "light" || pref === "dark") return pref;
  return systemPrefersLight() ? "light" : "dark";
}

/** Apply a resolved theme to the document — the `.dark` class and the
 * `theme-color` meta tag, the two things a plain CSS rule can't reach for
 * itself. Everything else repaints on its own once the class changes,
 * because every color in the app is one `--ar-*` token away from `.dark`. */
export function applyTheme(theme: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[theme]);
}

/**
 * Just "which theme is live right now", for things CSS can't reach.
 *
 * Mapbox is the reason this exists: its basemap is a style URL chosen in JS,
 * not a colour a token can repaint, so a map has to actually *know* the theme
 * to swap `dark-v11` for `light-v11`.
 *
 * Observes the `dark` class on `<html>` rather than reading the stored
 * preference, deliberately. That class is the single thing every other part of
 * this system already agrees on — the boot script sets it, `useTheme` sets it,
 * the OS listener sets it — so watching it works no matter which of those
 * moved last, and needs no second copy of the preference/`matchMedia` logic.
 * Several components can call this freely; each just holds one
 * `MutationObserver`, not another listener stack.
 *
 * Starts as "dark" on the server and on first render, matching the
 * `class="dark"` that `_document.tsx` server-renders — so the markup React
 * hydrates against is the markup it rendered, and the effect corrects it
 * immediately after if the real theme is light.
 */
export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    const read = (): ResolvedTheme =>
      document.documentElement.classList.contains("dark") ? "dark" : "light";

    setTheme(read());

    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

/**
 * Reads and writes the theme preference, applying it as it changes.
 *
 * Deliberately does *not* apply anything on its first render — the inline
 * boot script in `_document.tsx` already did, before this component or any
 * other ever mounted, which is what keeps first paint from flashing the
 * wrong theme. This hook's own effects only need to handle what happens
 * *after* that: the settings toggle calling `setPreference`, and — while the
 * preference is "auto" — the OS theme changing live under a session that's
 * already open.
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    readStoredPreference,
  );
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveTheme(preference),
  );

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    writeStoredPreference(pref);
    const next = resolveTheme(pref);
    setResolved(next);
    applyTheme(next);
  }, []);

  // Follow the OS live while — and only while — nothing's been chosen
  // explicitly. A manual "light" or "dark" is a deliberate override; the
  // system changing its mind shouldn't quietly undo it.
  useEffect(() => {
    if (preference !== "auto" || typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;

    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const next = resolveTheme("auto");
      setResolved(next);
      applyTheme(next);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [preference]);

  return { preference, resolved, setPreference };
}
