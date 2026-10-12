import { Loader2 } from "lucide-react-native";
import { useEffect } from "react";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { useColors } from "~/theme/theme";

/**
 * The web's busy indicator: lucide `Loader2` with Tailwind `animate-spin`
 * (one turn per second, linear). Replaces iOS's grey ActivityIndicator so
 * busy states look like the rest of the app. A plain rotate — no offscreen
 * cost — and it keeps turning under reduced motion, as on the web.
 */
export function Spinner({ size = 18, color, strokeWidth = 2.6 }: { size?: number; color?: string; strokeWidth?: number }) {
  const { c } = useColors();
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1);
    return () => cancelAnimation(turn);
  }, [turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <Animated.View style={[{ width: size, height: size }, spin]} accessibilityRole="progressbar" accessibilityLabel="Loading">
      <Loader2 size={size} strokeWidth={strokeWidth} color={color ?? c("ar-green-hot")} />
    </Animated.View>
  );
}
