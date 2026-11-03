"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

import {
  onTabReturn,
  readSharedTheme,
  writeSharedTheme,
  isSharedTheme,
} from "@wadzzo/ui/lib/shared-theme";

export { THEME_STORAGE_KEY } from "./theme-storage-key";

/**
 * Keeps this site's theme in step with the other Wadzzo sites (see `@wadzzo/ui/lib/shared-theme`):
 * a change made here is written to the shared cookie, and a change made elsewhere is picked up
 * when this tab comes back into view.
 */
export function SharedThemeSync() {
  const { theme, setTheme } = useTheme();
  const current = useRef(theme);

  useEffect(() => {
    current.current = theme;
    if (isSharedTheme(theme)) writeSharedTheme(theme);
  }, [theme]);

  useEffect(
    () =>
      onTabReturn(() => {
        const shared = readSharedTheme();
        if (shared && shared !== current.current) setTheme(shared);
      }),
    [setTheme],
  );

  return null;
}
