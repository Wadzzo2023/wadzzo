import { router } from "expo-router";
import { X } from "lucide-react-native";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import Svg, { Defs, RadialGradient as SvgRadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Grid } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useColors } from "~/theme/theme";

/** Shared frame for the auth screens: grid + glow backdrop, close, title. */
export function AuthScreen({ eyebrow, title, body, children }: { eyebrow: string; title: string; body?: string; children: ReactNode }) {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} className="bg-ar-bg">
      <Grid opacity={0.06} />
      {/* Soft glow as a static radial gradient (drawn once), not a 90px
          blurred boxShadow (a masked offscreen layer every frame). */}
      <View pointerEvents="none" style={{ position: "absolute", left: "50%", top: -20, width: 520, height: 520, marginLeft: -260 }}>
        <Svg width={520} height={520}>
          <Defs>
            <SvgRadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={c("ar-green")} stopOpacity={0.2} />
              <Stop offset="0.55" stopColor={c("ar-green")} stopOpacity={0.100} />
              <Stop offset="1" stopColor={c("ar-green")} stopOpacity={0} />
            </SvgRadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#glow)" />
        </Svg>
      </View>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/map"))}
        accessibilityRole="button"
        accessibilityLabel="Close"
        className="absolute right-4 z-10 h-9 w-9 items-center justify-center rounded-full border border-ar-line bg-ar-surface"
        style={{ top: Math.max(insets.top, 16) + 6 }}
      >
        <X size={17} strokeWidth={2.4} color={c("ar-text-dim")} />
      </Pressable>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: Math.max(insets.top, 16) + 64, paddingBottom: insets.bottom + 32 }}>
        <Text className="font-hud mb-1 text-[10px] font-semibold uppercase tracking-[3.2px] text-ar-green">{eyebrow}</Text>
        <Text className="font-hud text-[28px] font-bold leading-8 text-ar-text">{title}</Text>
        {body && <Text className="mt-2 text-[13px] leading-5 text-ar-dim">{body}</Text>}
        <View className="mt-7">{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
