import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Sparkles } from "lucide-react-native";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Grid } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import type { Rarity } from "~/lib/ar/types";
import { useDecorativeMotion } from "~/lib/motion";
import { useColors } from "~/theme/theme";

const MARK = require("../../../assets/brand/wadzzo-mark.png");
type Phase = "sealed" | "stripping" | "tearing" | "open";
const STRIP_MS = 460;
const TEAR_MS = 780;
const key = (k: string) => `wadzzo-pack-opened:${k}`;

/**
 * Port of the web's PackOpening: a sealed foil pack torn open before the
 * card is revealed — sealed → stripping (tear strip peels off) → tearing
 * (halves split and fall away, rarity burst behind) → open. Once per card:
 * the web keeps it per tab session; here it's remembered on the device.
 */
export function PackOpening({ rarity, openedKey, children }: { rarity: Rarity; openedKey?: string; children: ReactNode }) {
  const { rarity: rc, c } = useColors();
  const reduced = useReducedMotion();
  const livePulse = useDecorativeMotion();
  const [phase, setPhase] = useState<Phase | null>(openedKey ? null : "sealed");

  useEffect(() => {
    if (!openedKey) return;
    void AsyncStorage.getItem(key(openedKey)).then((v) => setPhase(v ? "open" : "sealed"));
  }, [openedKey]);

  const open = useCallback(() => {
    if (phase !== "sealed") return;
    setPhase("stripping");
    if (openedKey) void AsyncStorage.setItem(key(openedKey), "1");
  }, [phase, openedKey]);

  useEffect(() => {
    if (phase === "stripping") {
      const id = setTimeout(() => setPhase("tearing"), reduced ? 0 : STRIP_MS);
      return () => clearTimeout(id);
    }
    if (phase === "tearing") {
      const id = setTimeout(() => setPhase("open"), reduced ? 260 : TEAR_MS);
      return () => clearTimeout(id);
    }
  }, [phase, reduced]);

  const revealed = phase === "tearing" || phase === "open";
  const card = useSharedValue(0);
  useEffect(() => {
    card.value = revealed ? withDelay(120, withSpring(1, { stiffness: 220, damping: 22 })) : 0;
  }, [revealed, card]);
  const cardStyle = useAnimatedStyle(() => ({ opacity: card.value, transform: [{ scale: 0.92 + 0.08 * card.value }] }));

  const strip = useSharedValue(0);
  useEffect(() => {
    if (phase === "stripping" || phase === "tearing") strip.value = withTiming(1, { duration: STRIP_MS, easing: Easing.bezier(0.4, 0, 0.3, 1) });
  }, [phase, strip]);
  const stripStyle = useAnimatedStyle(() => ({ opacity: 1 - strip.value, transform: [{ translateX: `${strip.value * 108}%` }, { rotate: `${strip.value * 7}deg` }] }));

  const burst = useSharedValue(0);
  useEffect(() => {
    if (phase === "tearing" && !reduced) burst.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.ease) });
  }, [phase, reduced, burst]);
  const burstStyle = useAnimatedStyle(() => {
    const s = 40 + 520 * burst.value;
    return { width: s, height: s, borderRadius: s / 2, marginLeft: -s / 2, marginTop: -s / 2, opacity: burst.value < 0.5 ? burst.value * 2 : (1 - burst.value) * 2 };
  });

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!livePulse) {
      cancelAnimation(pulse);
      return;
    }
    pulse.value = withRepeat(withSequence(withTiming(1.05, { duration: 900 }), withTiming(1, { duration: 900 })), -1);
  }, [livePulse, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  if (!phase) return <View style={{ opacity: 0 }}>{children}</View>;

  return (
    <View>
      <Animated.View style={cardStyle}>{children}</Animated.View>

      {phase !== "open" && (
        <Animated.View exiting={FadeOut} style={[StyleSheet.absoluteFill, { zIndex: 20 }]}>
          {phase === "tearing" && !reduced && (
            // Crisp halos instead of an 80px blurred glow (a large offscreen pass).
            <Animated.View pointerEvents="none" style={[{ position: "absolute", left: "50%", top: "50%", zIndex: -1, backgroundColor: rc(rarity, 0.45) }, burstStyle]}>
              <View style={{ position: "absolute", left: "-25%", top: "-25%", width: "150%", height: "150%", borderRadius: 9999, backgroundColor: rc(rarity, 0.22) }} />
              <View style={{ position: "absolute", left: "-55%", top: "-55%", width: "210%", height: "210%", borderRadius: 9999, backgroundColor: rc(rarity, 0.1) }} />
            </Animated.View>
          )}
          <PackHalf side="left" rarity={rarity} tearing={phase === "tearing"} reduced={reduced} onOpen={open} />
          <PackHalf side="right" rarity={rarity} tearing={phase === "tearing"} reduced={reduced} onOpen={open} />
          <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, right: 0, top: 0, height: "11%", overflow: "hidden", borderTopLeftRadius: 14, borderTopRightRadius: 14, zIndex: 15 }, stripStyle]}>
            <LinearGradient colors={[rc(rarity, 0.55), c("ar-void")]} style={StyleSheet.absoluteFill} />
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, flexDirection: "row", gap: 4, overflow: "hidden" }}>
              {Array.from({ length: 60 }).map((_, i) => (
                <View key={i} style={{ width: 3, height: 2, backgroundColor: rc(rarity, 0.9) }} />
              ))}
            </View>
            <Text className="font-hud text-center font-bold uppercase" style={{ position: "absolute", left: 0, right: 0, top: "35%", fontSize: 7, letterSpacing: 2.1, color: "rgba(255,255,255,0.45)" }}>
              Tear
            </Text>
          </Animated.View>
          {phase === "sealed" && (
            <Pressable onPress={open} accessibilityRole="button" accessibilityLabel="Tear open to reveal your collectible" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", gap: 12, zIndex: 10 }]}>
              <Image source={MARK} style={{ width: 50, height: 40 }} contentFit="contain" />
              <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderColor: rc(rarity, 0.5), backgroundColor: rc(rarity, 0.12) }, pulseStyle]}>
                <Sparkles size={11} strokeWidth={2.6} color={rc(rarity)} />
                <Text className="font-hud text-[10px] font-bold uppercase tracking-[1.8px]" style={{ color: rc(rarity) }}>
                  Tap to open
                </Text>
              </Animated.View>
            </Pressable>
          )}
        </Animated.View>
      )}
    </View>
  );
}

function PackHalf({ side, rarity, tearing, reduced, onOpen }: { side: "left" | "right"; rarity: Rarity; tearing: boolean; reduced: boolean; onOpen: () => void }) {
  const { rarity: rc, c } = useColors();
  const left = side === "left";
  const t = useSharedValue(0);
  useEffect(() => {
    if (tearing) t.value = withTiming(1, { duration: reduced ? 260 : TEAR_MS, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  }, [tearing, reduced, t]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: reduced ? [] : [{ translateX: `${(left ? -62 : 62) * t.value}%` }, { rotate: `${(left ? -14 : 14) * t.value}deg` }],
  }));
  return (
    <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, width: "50%", ...(left ? { left: 0 } : { right: 0 }), overflow: "hidden", transformOrigin: left ? "left center" : "right center" }, style]}>
      <Pressable onPress={onOpen} style={{ flex: 1 }}>
        <View style={{ position: "absolute", top: 0, bottom: 0, width: "200%", ...(left ? { left: 0 } : { right: 0 }), borderRadius: 14, overflow: "hidden", borderWidth: 1.5, borderColor: rc(rarity, 0.55) }}>
          <LinearGradient colors={[rc(rarity, 0.45), c("ar-surface"), c("ar-void"), rc(rarity, 0.35)]} locations={[0, 0.28, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Grid opacity={0.2 * 0.07 * 14} />
        </View>
        <View style={{ position: "absolute", top: 0, bottom: 0, width: 1, ...(left ? { right: 0 } : { left: 0 }), backgroundColor: rc(rarity, 0.7) }} />
      </Pressable>
    </Animated.View>
  );
}
