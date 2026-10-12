import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useDecorativeMotion } from "~/lib/motion";

/**
 * The web's `.animate-pulse-ring` (2.2s, cubic-bezier(0.2,0.7,0.3,1)): a ring
 * expanding and fading out from a solid dot. Static whenever decorative
 * motion is off (reduced motion, Low Power Mode, backgrounded, screen hidden).
 */
export function PulseDot({ color, size = 6 }: { color: string; size?: number }) {
  const live = useDecorativeMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!live) {
      cancelAnimation(t);
      t.value = 1;
      return;
    }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.bezier(0.2, 0.7, 0.3, 1) }), -1);
  }, [live, t]);
  const ring = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [{ scale: 1 + t.value * 1.6 }],
  }));
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[{ position: "absolute", width: size, height: size, borderRadius: size, backgroundColor: color }, ring]} />
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

/** Same pulse, as a ring around an arbitrary circle (AR launcher, markers). */
export function PulseRing({ color, size, duration = 2200 }: { color: string; size: number; duration?: number }) {
  const live = useDecorativeMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!live) {
      cancelAnimation(t);
      return;
    }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.bezier(0.2, 0.7, 0.3, 1) }), -1);
  }, [live, t, duration]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.9 * (1 - t.value),
    transform: [{ scale: 1 + t.value * 0.45 }],
  }));
  if (!live) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: color }, style]}
    />
  );
}
