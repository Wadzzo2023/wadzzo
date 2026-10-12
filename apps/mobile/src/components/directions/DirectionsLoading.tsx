import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import { BackButton } from "~/components/shell/ScreenHeader";
import { Skeleton } from "~/components/ui/Skeleton";
import { Text } from "~/components/ui/Text";
import { useDecorativeMotion } from "~/lib/motion";
import { useColors } from "~/theme/theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);
const ROUTE = "M98 296 L114 238 L122 176 L236 164 L244 104";
/** Length of ROUTE in artboard units (RN SVG has no pathLength). */
const LEN = 298;
const LINES = ["Finding the drop…", "Plotting your route…", "Checking every way there…"];

/**
 * Port of wadzzoAR's DirectionsLoading: shown while the Directions target
 * loads. Same layout as the preview (map, back, map buttons, sheet) so nothing
 * jumps; a route draws itself from "you" to a flag; a status line cycles.
 */
export function DirectionsLoading({ mural }: { mural?: boolean }) {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const live = useDecorativeMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % LINES.length), 1600);
    return () => clearInterval(t);
  }, []);
  const lines = mural ? ["Finding the mural…", ...LINES.slice(1)] : LINES;

  const draw = useSharedValue(live ? LEN : 0);
  const pulse = useSharedValue(0);
  const bob = useSharedValue(0);
  useEffect(() => {
    if (!live) return;
    draw.set(withRepeat(withSequence(withTiming(0, { duration: 1540, easing: Easing.bezier(0.6, 0, 0.3, 1) }), withTiming(0, { duration: 660 }), withTiming(LEN, { duration: 0 })), -1));
    pulse.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1));
    bob.set(withRepeat(withSequence(withTiming(0, { duration: 1200 }), withTiming(-6, { duration: 330 }), withTiming(0, { duration: 330 }), withTiming(0, { duration: 340 })), -1));
  }, [live, draw, pulse, bob]);

  const routeProps = useAnimatedProps(() => ({ strokeDashoffset: draw.get() }));
  const pulseProps = useAnimatedProps(() => ({ r: 11 + 29 * pulse.get(), opacity: 0.5 * (1 - pulse.get()) }));
  const flagProps = useAnimatedProps(() => ({ y: bob.get() }));
  const epic = c("rarity-epic");

  return (
    <View className="flex-1 bg-ar-bg" accessibilityLabel="Loading directions" accessibilityRole="progressbar">
      {/* Map stand-in. 360×520 artboard, scaled to cover. */}
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="0 0 360 520" preserveAspectRatio="xMidYMid slice">
          {["M-20 360 L380 300", "M70 -20 L120 560", "M-20 150 L380 190", "M250 -20 L230 560"].map((d) => (
            <Path key={d} d={d} stroke={c("ar-line")} strokeWidth={10} strokeLinecap="round" fill="none" opacity={0.55} />
          ))}
          <Path d={ROUTE} fill="none" stroke="#3fd831" strokeOpacity={0.18} strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
          <AnimatedPath d={ROUTE} fill="none" stroke="#3fd831" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${LEN} ${LEN}`} animatedProps={routeProps} />
          <AnimatedCircle cx={98} cy={296} fill="#3fd831" animatedProps={pulseProps} />
          <Circle cx={98} cy={296} r={8} fill="#3fd831" stroke="#fff" strokeWidth={3} />
          <AnimatedG animatedProps={flagProps}>
            <Path d="M244 104 L244 70" stroke={epic} strokeWidth={3} strokeLinecap="round" />
            <Rect x={226} y={40} width={36} height={36} rx={11} fill={c("ar-surface")} stroke={epic} strokeWidth={3} />
            <Path d="M237 66 L237 50 L251 54 L237 59" fill={epic} />
          </AnimatedG>
        </Svg>
      </View>

      <View style={{ position: "absolute", left: 16, top: insets.top + 12 }}>
        <BackButton />
      </View>
      <View style={{ position: "absolute", right: 12, top: insets.top + 12, gap: 10 }}>
        <Skeleton className="h-11 w-11 rounded-full" />
        <Skeleton className="h-11 w-11 rounded-full" />
      </View>

      <View style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 214, alignItems: "center" }}>
        <Animated.View key={i} entering={FadeInDown.duration(300)} style={{ borderRadius: 999, backgroundColor: c("ar-surface", 0.92), paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text className="font-hud text-[11px] font-bold uppercase tracking-[1.6px] text-ar-green-hot">{lines[i]}</Text>
        </Animated.View>
      </View>

      {/* Sheet skeleton — same shape as the real one. */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: c("ar-line"), backgroundColor: c("ar-bg"), paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 16 }}>
        <View style={{ alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: c("ar-line-bright", 0.7), marginBottom: 10 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Skeleton className="h-12 w-12 rounded-[12px]" />
          <View style={{ flex: 1 }}>
            <Skeleton className="h-4 w-40 rounded-full" />
            <Skeleton className="mt-2 h-3 w-28 rounded-full" />
          </View>
        </View>
        <View style={{ marginTop: 12, flexDirection: "row", gap: 6 }}>
          {[0, 1, 2, 3].map((k) => (
            <View key={k} style={{ flex: 1 }}>
              <Skeleton className="h-9 rounded-full" />
            </View>
          ))}
        </View>
        <View style={{ marginTop: 12, flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Skeleton className="h-6 w-32 rounded-full" />
            <Skeleton className="mt-2 h-3 w-48 rounded-full" />
          </View>
          <Skeleton className="h-12 w-28 rounded-[14px]" />
        </View>
      </View>
    </View>
  );
}
