import { cssInterop } from "nativewind";
import { forwardRef } from "react";
import { Text as RNText, StyleSheet, type TextProps } from "react-native";

import { resolveFont } from "~/theme/fonts";

/**
 * The app's Text. Accepts web-identical classes (`font-hud font-bold
 * uppercase tracking-[0.12em] text-ar-dim`) and turns the family *role* plus
 * weight into the real font file, which plain RN Text can't do.
 *
 * Body text scales with the OS setting up to 1.3×; HUD labels stay fixed so
 * the chrome keeps its shape (docs/04-design-system.md → Type).
 */
export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...rest }, ref) {
  const flat = StyleSheet.flatten(style) ?? {};
  const role = flat.fontFamily;
  const fontFamily = resolveFont(role, flat.fontWeight);
  const hud = role === "hud";
  return (
    <RNText
      ref={ref}
      maxFontSizeMultiplier={hud ? 1 : 1.3}
      {...rest}
      style={[flat, { fontFamily, fontWeight: undefined }]}
    />
  );
});

cssInterop(Text, { className: "style" });
