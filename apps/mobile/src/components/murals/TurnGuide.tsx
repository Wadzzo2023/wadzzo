import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";

import { useDecorativeMotion } from "~/lib/motion";
import type { SweepStep } from "~/lib/murals/useMuralSweep";
import { useColors } from "~/theme/theme";

/**
 * ── Turn guide (mobile port, 2026-10-05 round) ─────────────────────────────
 *
 * EdgeChevrons — chevrons flowing along the screen edge you should turn to. Reanimated loops
 * on the UI thread; still when reduced motion / low power is on. The rest of
 * the turn guidance is in ScanCoach.tsx.
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
  // Holding on the mural for the middle photo: nothing to turn to yet.
  if (step === "done" || step === "centre") return null;
  const sides: ("left" | "right")[] = step === "left" ? ["left"] : ["right"];
  return (
    <>
      {sides.map((side) => {
        const pointLeft = side === "left";
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
