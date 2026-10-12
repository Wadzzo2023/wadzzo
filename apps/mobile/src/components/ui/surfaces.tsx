import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, Line, Pattern, Rect } from "react-native-svg";

import { useColors } from "~/theme/theme";

/**
 * ── Surfaces ───────────────────────────────────────────────────────────────
 *
 * Native versions of the web's `.ar-glass`, `.ar-bevel` and `.ar-grid`
 * (wadzzoAR/src/styles/arcade.css). Shadows are the same layered stacks —
 * React Native's `boxShadow` takes inset layers — so the plinths and inner
 * highlights read the same as on the web.
 */

/**
 * `.ar-glass` — translucent panel with a 1px line and top highlight.
 *
 * GPU note: no live blur and no boxShadow. A blur re-renders what's behind it
 * every frame that changes (the map, a scrolling list), and React Native draws
 * every boxShadow as a masked layer — an offscreen pass per frame. A solid
 * tint plus a plain 1px highlight line looks nearly the same for ~nothing.
 */
export function Glass({
  children,
  style,
  className,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
  /** Kept for call sites; there's no blur any more. */
  intensity?: number;
}) {
  const { c, theme } = useColors();
  return (
    <View
      className={className}
      style={[
        {
          overflow: "hidden",
          borderWidth: 1,
          borderColor: c("ar-line", 0.9),
          backgroundColor: c("ar-surface", 0.85),
        },
        style,
      ]}
    >
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.6)" }} />
      {children}
    </View>
  );
}

/** `.ar-bevel` — inset panel: surface-2 → surface, 2px void plinth. */
export function Bevel({
  children,
  style,
  className,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  const { c, theme } = useColors();
  return (
    <View
      className={className}
      style={[
        {
          borderWidth: 1,
          borderColor: c("ar-line"),
          // The 2px plinth under the panel, as a thicker bottom border
          // (was a masked boxShadow — see Glass).
          borderBottomWidth: 3,
          borderBottomColor: theme === "dark" ? c("ar-void") : c("ar-line", 0.9),
        },
        style,
      ]}
    >
      <LinearGradient
        colors={[c("ar-surface-2"), c("ar-surface")]}
        style={[StyleSheet.absoluteFill, { borderRadius: StyleSheet.flatten(style)?.borderRadius }]}
      />
      {children}
    </View>
  );
}

/** `.ar-grid` — the faint 44px terrain grid behind hero areas. */
export function Grid({
  size = 44,
  opacity = 0.07,
  style,
}: {
  size?: number;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useColors();
  const stroke = c("ar-green", opacity);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="ar-grid" width={size} height={size} patternUnits="userSpaceOnUse">
            <Line x1="0" y1="0" x2={size} y2="0" stroke={stroke} strokeWidth={1} />
            <Line x1="0" y1="0" x2="0" y2={size} stroke={stroke} strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#ar-grid)" />
      </Svg>
    </View>
  );
}
