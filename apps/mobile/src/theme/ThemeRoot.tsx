import { vars } from "nativewind";
import { useMemo, type ReactNode } from "react";
import { View } from "react-native";

import { useResolvedTheme } from "./theme";
import { palettes, type TokenName } from "./tokens";

/**
 * Sets the colour variables every `bg-ar-*` / `text-rarity-*` class reads,
 * for the resolved light or dark palette. The native counterpart of the web's
 * `:root` / `.dark` blocks in arcade.css.
 */
export function ThemeRoot({ children }: { children: ReactNode }) {
  const theme = useResolvedTheme();
  const style = useMemo(() => {
    const p = palettes[theme];
    return vars(
      Object.fromEntries(
        (Object.keys(p) as TokenName[]).map((k) => [`--${k}`, p[k].join(" ")]),
      ),
    );
  }, [theme]);

  return (
    <View style={[{ flex: 1 }, style]} className="bg-ar-bg">
      {children}
    </View>
  );
}
