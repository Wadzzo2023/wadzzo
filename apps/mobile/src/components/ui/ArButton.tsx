import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, type Href } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { forwardRef, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { Spinner } from "~/components/ui/Spinner";
import { cn } from "~/lib/utils";
import { useFeedbackSettings } from "~/lib/ar/feedback";
import { useColors } from "~/theme/theme";

import { Text } from "./Text";

type Variant = "primary" | "ghost" | "outline" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, { h: number; px: number; text: number; radius: number; icon: number; gap: number }> = {
  sm: { h: 36, px: 14, text: 12, radius: 11, icon: 14, gap: 6 },
  md: { h: 44, px: 16, text: 13.5, radius: 16, icon: 16, gap: 8 },
  lg: { h: 54, px: 24, text: 15, radius: 22, icon: 19, gap: 10 },
};

const PLINTH = 3;

interface Props {
  children?: ReactNode;
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  block?: boolean;
  /** Work in flight: keeps full weight and spins, unlike `disabled`. */
  busy?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * ── ArButton ───────────────────────────────────────────────────────────────
 *
 * Port of the web's key-cap button (`.ar-key` and variants): a face sitting on
 * a 3px plinth that travels down onto it on press, so every tap gets a
 * mechanical acknowledgement before the network answers. Plus a light
 * selection haptic, which the web can't do.
 */
export const ArButton = forwardRef<View, Props>(function ArButton(
  { children, variant = "outline", size = "md", icon: Icon, iconRight: IconRight, block, busy, disabled, onPress, className, style, accessibilityLabel },
  ref,
) {
  const { c } = useColors();
  const { haptics } = useFeedbackSettings();
  const s = SIZES[size];
  const pressed = useSharedValue(0);
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: pressed.value * PLINTH }] }));

  const palette: Record<Variant, { from: string; to: string; border: string; ink: string; plinth: string; glow: string } | null> = {
    primary: { from: c("ar-green"), to: c("ar-green-deep"), border: c("ar-green", 0.75), ink: c("ar-green-ink"), plinth: c("ar-green-ink"), glow: c("ar-green", 0.7) },
    gold: { from: c("rarity-legendary"), to: "hsl(36, 88%, 24%)", border: c("rarity-legendary", 0.75), ink: "hsl(40, 40%, 97%)", plinth: "hsl(36, 80%, 16%)", glow: c("rarity-legendary", 0.5) },
    danger: { from: c("ar-danger"), to: "hsl(358, 70%, 34%)", border: c("ar-danger", 0.7), ink: "#fff", plinth: "hsl(358, 70%, 20%)", glow: c("ar-danger", 0.6) },
    outline: { from: c("ar-surface-3"), to: c("ar-surface"), border: c("ar-line-bright"), ink: c("ar-text"), plinth: c("ar-void"), glow: "rgba(0,0,0,0.35)" },
    ghost: null,
  };
  const p = palette[variant];
  const ink = p?.ink ?? c("ar-text-dim");
  const inert = disabled || busy;

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={inert}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: 120 });
        if (haptics) void Haptics.selectionAsync();
      }}
      onPressOut={() => (pressed.value = withTiming(0, { duration: 120 }))}
      onPress={onPress}
      // No alignSelf unless `block`: like the web's inline-flex key, the
      // button follows its parent — centred in an `items-center` column,
      // vertically centred in a row. Forcing "self-start" pinned every
      // non-block button to the left edge of centred empty/error states.
      className={cn(block && "self-stretch", className)}
      style={[{ opacity: disabled ? 0.4 : 1, paddingBottom: p ? PLINTH : 0 }, style]}
    >
      {p && (
        <View
          style={[StyleSheet.absoluteFill, { top: PLINTH, borderRadius: s.radius, backgroundColor: p.plinth, boxShadow: variant === "primary" ? `0 8px 22px -6px ${p.glow}` : undefined }]}
        />
      )}
      <Animated.View
        style={[
          face,
          {
            height: s.h,
            paddingHorizontal: s.px,
            borderRadius: s.radius,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: s.gap,
            overflow: "hidden",
            borderWidth: p ? 1 : 0,
            borderColor: p?.border,
            // Only primary keeps the (masked, offscreen) glow + inset highlight; the
            // rest get the same highlight as a plain 1px line below.
            boxShadow: variant === "primary" ? "inset 0 1px 0 0 rgba(255,255,255,0.3)" : undefined,
          },
        ]}
      >
        {p && <LinearGradient colors={[p.from, p.to]} style={StyleSheet.absoluteFill} />}
        {p && variant !== "primary" && <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.3)" }} />}
        {busy ? <Spinner size={s.icon} color={ink} /> : Icon ? <Icon size={s.icon} strokeWidth={2.3} color={ink} /> : null}
        {typeof children === "string" ? (
          <Text className="font-hud font-semibold uppercase" style={{ color: ink, fontSize: s.text, letterSpacing: s.text * 0.08 }} numberOfLines={1}>
            {children}
          </Text>
        ) : (
          children
        )}
        {!busy && IconRight ? <IconRight size={s.icon} strokeWidth={2.3} color={ink} /> : null}
      </Animated.View>
    </Pressable>
  );
});

/** Same surface, navigating — the web's `ArLinkButton`. */
export function ArLinkButton({ href, replace, ...props }: Props & { href: Href; replace?: boolean }) {
  return <ArButton {...props} onPress={() => (replace ? router.replace(href) : router.push(href))} />;
}

/**
 * Round glass control for the map rail — recenter, compass, auto-collect.
 * Icon-only, so `label` is the accessible name.
 */
export function ArIconButton({
  icon: Icon,
  label,
  active,
  onPress,
  className,
  size = 44,
  children,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onPress?: () => void;
  className?: string;
  size?: number;
  children?: ReactNode;
}) {
  const { c } = useColors();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const { haptics } = useFeedbackSettings();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      onPressIn={() => {
        scale.value = withTiming(0.92, { duration: 90 });
        if (haptics) void Haptics.selectionAsync();
      }}
      onPressOut={() => (scale.value = withTiming(1, { duration: 120 }))}
      onPress={onPress}
      className={className}
    >
      <Animated.View
        style={[
          anim,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            borderColor: active ? c("ar-green", 0.6) : c("ar-line", 0.9),
            backgroundColor: c("ar-surface", 0.8),
            // No boxShadow: RN draws each as a masked layer (an offscreen pass
            // per frame). The active ring is just a thicker border.
            borderWidth: active ? 2 : 1,
          },
        ]}
      >
        <Icon size={19} strokeWidth={2.1} color={active ? c("ar-green-hot") : c("ar-text-dim")} />
        {children}
      </Animated.View>
    </Pressable>
  );
}
