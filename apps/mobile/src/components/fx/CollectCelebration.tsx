import { Canvas, Circle, SweepGradient, vec } from "@shopify/react-native-skia";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
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

import { HoloCard } from "~/components/cards/HoloCard";
import { Text } from "~/components/ui/Text";
import { RARITY_META } from "~/lib/ar/rarity";
import type { ArPin } from "~/lib/ar/types";
import { useColors } from "~/theme/theme";

import { Confetti } from "./Confetti";

/**
 * Port of the web's CollectCelebration: the card rises from the bottom,
 * turns over, lands with a shockwave and gets stamped "Collected". Rarer
 * cards hold longer (legendary/mythic 3.4s vs 2.5s). Tap to dismiss.
 */
export function CollectCelebration({ pin, onDone }: { pin: ArPin; onDone: () => void }) {
  const { c, rarity: rc } = useColors();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const [burst, setBurst] = useState(0);
  const meta = RARITY_META[pin.rarity];
  const loud = pin.rarity === "legendary" || pin.rarity === "mythic";
  const hold = loud ? 3_400 : 2_500;

  useEffect(() => {
    if (reduced) {
      onDone();
      return;
    }
    const fire = setTimeout(() => setBurst((n) => n + 1), 620);
    const exit = setTimeout(onDone, hold);
    return () => {
      clearTimeout(fire);
      clearTimeout(exit);
    };
  }, [reduced, onDone, hold]);

  const rise = useSharedValue(0);
  const float = useSharedValue(0);
  const rays = useSharedValue(0);
  const shock = useSharedValue(0);
  const stamp = useSharedValue(0);
  useEffect(() => {
    rise.value = withSpring(1, { stiffness: 150, damping: 16, mass: 1.1 });
    float.value = withDelay(800, withRepeat(withSequence(withTiming(-9, { duration: 1800, easing: Easing.inOut(Easing.ease) }), withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.ease) })), -1));
    rays.value = withRepeat(withTiming(1, { duration: 26_000, easing: Easing.linear }), -1);
    shock.value = withDelay(580, withTiming(1, { duration: 1000, easing: Easing.out(Easing.ease) }));
    stamp.value = withDelay(620, withSpring(1, { stiffness: 460, damping: 15 }));
  }, [rise, float, rays, shock, stamp]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, rise.value * 5),
    transform: [
      { perspective: 1400 },
      { translateY: 340 * (1 - rise.value) + float.value },
      { rotateY: `${180 * (1 - rise.value)}deg` },
      { rotateZ: `${-18 * (1 - rise.value)}deg` },
      { scale: 0.7 + 0.3 * rise.value },
    ],
  }));
  const raysStyle = useAnimatedStyle(() => ({ opacity: 0.45 * Math.min(1, rise.value), transform: [{ rotate: `${rays.value * 360}deg` }, { scale: 0.6 + 0.4 * Math.min(1, rise.value) }] }));
  const shockStyle = useAnimatedStyle(() => ({ opacity: shock.value === 0 ? 0 : shock.value < 0.2 ? shock.value * 4.25 : 0.85 * (1 - shock.value), transform: [{ scale: 0.3 + 3.1 * shock.value }] }));
  const stampStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, stamp.value * 1.5), transform: [{ scale: 2.6 - 1.6 * stamp.value }, { rotate: `${-12 + 9 * stamp.value}deg` }] }));

  if (reduced) return null;

  const R = 380;
  const stops: string[] = [];
  const positions: number[] = [];
  for (let i = 0; i < 6; i++) {
    const base = i * 60;
    stops.push(rc(pin.rarity, 0), rc(pin.rarity, 0.5), rc(pin.rarity, 0));
    positions.push(base / 360, (base + 12) / 360, (base + 26) / 360);
  }

  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(250)} style={[StyleSheet.absoluteFill, { zIndex: 80 }]}>
      <Pressable onPress={onDone} style={[StyleSheet.absoluteFill, { backgroundColor: c("ar-void", 0.92), alignItems: "center", justifyContent: "center", paddingHorizontal: 40, overflow: "hidden" }]}>
        <Animated.View pointerEvents="none" style={[{ position: "absolute", width: R * 2, height: R * 2 }, raysStyle]}>
          <Canvas style={{ flex: 1 }}>
            <Circle cx={R} cy={R} r={R}>
              <SweepGradient c={vec(R, R)} colors={[...stops, rc(pin.rarity, 0)]} positions={[...positions, 1]} />
            </Circle>
          </Canvas>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[{ position: "absolute", width: 192, height: 192, borderRadius: 96, borderWidth: 2, borderColor: rc(pin.rarity) }, shockStyle]} />

        <Animated.View style={[{ width: Math.min(230, width * 0.58) }, cardStyle]}>
          <HoloCard pin={{ ...pin, collected: true }} interactive oneFace />
        </Animated.View>

        <View style={{ marginTop: 28, alignItems: "center", zIndex: 10 }}>
          <Animated.View style={[{ borderRadius: 9, borderWidth: 2, paddingHorizontal: 14, paddingVertical: 4, borderColor: rc(pin.rarity), boxShadow: `0 0 26px -4px ${rc(pin.rarity, 0.9)}, inset 0 0 18px -6px ${rc(pin.rarity, 0.9)}` }, stampStyle]}>
            <Text className="font-hud text-[13px] font-bold uppercase tracking-[3.9px]" style={{ color: rc(pin.rarity) }}>
              Collected
            </Text>
          </Animated.View>
          <Animated.View entering={FadeIn.delay(720)}>
            <Text className="font-hud mt-4 max-w-[16rem] text-center text-[19px] font-bold leading-6 text-ar-text">{pin.title}</Text>
            <Text className="mt-1.5 text-center text-[12.5px] text-ar-dim">
              {meta.label} · {pin.brandName}
            </Text>
            {loud && (
              <Text className="font-hud mt-2 text-center text-[10px] font-semibold uppercase tracking-[2.2px]" style={{ color: rc(pin.rarity) }}>
                {meta.blurb}
              </Text>
            )}
          </Animated.View>
        </View>
        <Animated.View entering={FadeIn.delay(1400).duration(400)} style={{ position: "absolute", bottom: "7%" }}>
          <Text className="font-hud text-[9.5px] uppercase tracking-[2.9px] text-ar-faint">Tap to continue</Text>
        </Animated.View>
      </Pressable>
      <Confetti trigger={burst} rarity={pin.rarity} origin={{ x: 0.5, y: 0.46 }} count={loud ? 150 : 90} />
    </Animated.View>
  );
}
