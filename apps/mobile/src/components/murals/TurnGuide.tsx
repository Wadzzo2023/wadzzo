import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Circle, Rect } from "react-native-svg";

import { useDecorativeMotion } from "~/lib/motion";
import type { SweepStep } from "~/lib/murals/useMuralSweep";
import { useColors } from "~/theme/theme";

/**
 * ── Turn guide (mobile port, 2026-10-05 round) ─────────────────────────────
 *
 * EdgeChevrons — chevrons flowing along the screen edge you should turn to
 * (both edges, pointing inward, for "back to the middle"). GhostPhone — a
 * small phone above the gauge that turns the way to turn. Reanimated loops
 * on the UI thread; still when reduced motion / low power is on.
 */

function Chevron({ pointLeft, delay }: { pointLeft: boolean; delay: number }) {
  const { c } = useColors();
  const live = useDecorativeMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!live) {
      cancelAnimation(t);
      t.value = 0.5;
      return;
    }
    t.value = 0;
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1000, easing: Easing.out(Easing.quad) }), -1, false));
  }, [live, delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.4 ? t.value / 0.4 : 1 - (t.value - 0.4) / 0.6,
    transform: [{ translateX: (pointLeft ? 14 - 24 * t.value : -14 + 24 * t.value) }],
  }));
  const Icon = pointLeft ? ChevronLeft : ChevronRight;
  return (
    <Animated.View style={[{ marginHorizontal: -10 }, style]}>
      <Icon size={34} strokeWidth={3} color="#fff" />
      <View style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
        <Icon size={34} strokeWidth={6} color={c("rarity-epic")} />
      </View>
    </Animated.View>
  );
}

export function EdgeChevrons({ step }: { step: SweepStep }) {
  if (step === "done") return null;
  const sides: ("left" | "right")[] = step === "left" ? ["left"] : step === "right" ? ["right"] : ["left", "right"];
  return (
    <>
      {sides.map((side) => {
        const pointLeft = step === "centre" ? side === "right" : side === "left";
        return (
          <View
            key={side}
            pointerEvents="none"
            style={{ position: "absolute", top: "45%", [side]: 4, flexDirection: pointLeft ? "row" : "row-reverse" }}
          >
            {[0, 1, 2].map((i) => (
              <Chevron key={i} pointLeft={pointLeft} delay={(pointLeft ? i : 2 - i) * 160} />
            ))}
          </View>
        );
      })}
    </>
  );
}

export function GhostPhone({ step }: { step: SweepStep }) {
  const { c } = useColors();
  const live = useDecorativeMotion();
  const r = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(r);
    r.value = 0;
    if (!live || step === "done") return;
    const to = step === "left" ? -38 : step === "right" ? 38 : 14;
    r.value =
      step === "centre"
        ? withRepeat(withSequence(withTiming(-14, { duration: 600 }), withTiming(14, { duration: 600 })), -1, true)
        : withRepeat(withSequence(withTiming(0, { duration: 240 }), withTiming(to, { duration: 720 }), withTiming(to, { duration: 400 }), withTiming(0, { duration: 240 })), -1, false);
  }, [step, live, r]);
  const style = useAnimatedStyle(() => ({ transform: [{ perspective: 240 }, { rotateY: `${r.value}deg` }] }));
  if (step === "done") return null;
  return (
    <View style={{ height: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
      <Animated.View style={style}>
        <Svg width={20} height={32} viewBox="0 0 24 40">
          <Rect x="1.5" y="1.5" width="21" height="37" rx="4.5" fill={c("rarity-epic", 0.25)} stroke="#fff" strokeWidth={2} />
          <Rect x="9" y="4.5" width="6" height="1.6" rx="0.8" fill="#fff" opacity={0.8} />
          <Circle cx="12" cy="20" r="4.5" fill="none" stroke="#fff" strokeWidth={1.6} opacity={0.9} />
        </Svg>
      </Animated.View>
    </View>
  );
}
