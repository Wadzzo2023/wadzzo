import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Check, Lock, Zap } from "lucide-react-native";
import { memo, useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { PulseRing } from "~/components/ui/PulseDot";
import { Text } from "~/components/ui/Text";
import { pinStatus } from "~/lib/ar/rarity";
import type { ArPin } from "~/lib/ar/types";
import { useDecorativeMotion } from "~/lib/motion";
import { useColors } from "~/theme/theme";

/**
 * Port of the web's PinMarker: a hex-ish medallion with the brand mark,
 * rarity ring, stem and ground shadow. Four states readable at a glance —
 * in range + claimable (full colour, sonar, floating), out of range (dimmed,
 * grounded), collected (desaturated, gold tick), locked/dead (flattened).
 *
 * Shape says how it's collected (same as the web): round = tap to collect,
 * square = auto-collect.
 *
 * GPU budget: up to 80 of these sit on the map at once, so only the selected
 * pin gets a blurred glow. Everything else is a crisp ring or flat fill —
 * each blurred boxShadow, and each group `opacity`, costs an offscreen pass
 * per frame (a device trace showed ~170/frame before this). Dimming is done
 * with colour alpha on the leaf layers instead of opacity on the group.
 */
export const PinMarker = memo(function PinMarker({ pin, selected, inRange, onSelect }: { pin: ArPin; selected: boolean; inRange: boolean; onSelect: (id: string) => void }) {
  const { c, rarity: rc } = useColors();
  const [failed, setFailed] = useState(false);
  const status = pinStatus(pin);
  const live = status === "collectible";
  const dead = status === "expired" || status === "depleted";
  const ring = dead ? c("ar-locked") : rc(pin.rarity);
  const ringA = (a: number) => (dead ? c("ar-locked", a) : rc(pin.rarity, a));
  const floating = live && inRange;

  const scale = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(selected ? 1.22 : 1, { stiffness: 480, damping: 24 }) }] }));
  // Leaf-level dimming (see the GPU note above).
  const dim = dead ? 0.45 : live ? 1 : 0.75;
  // Square = auto-collect, round = tap (web: rounded-[10px] / rounded-full).
  const square = pin.autoCollect;
  const r = square ? { outer: 10, halo: 14, fill: 8, img: 6 } : { outer: 21, halo: 26, fill: 19, img: 15 };

  return (
    <Pressable onPress={() => onSelect(pin.id)} accessibilityRole="button" accessibilityLabel={`${pin.title} — ${pin.brandName}`} hitSlop={6} style={{ width: 52, height: 58, alignItems: "center" }}>
      {/* Ground shadow: a flat soft-edged blob, no blur. */}
      <View
        style={{
          position: "absolute",
          bottom: 2,
          width: floating ? 22 : 28,
          height: 5,
          borderRadius: 3,
          backgroundColor: floating ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.45)",
        }}
      />
      <Lift floating={floating}>
        {floating && (
          <View style={{ position: "absolute", width: 42, height: 42, alignItems: "center", justifyContent: "center" }}>
            <PulseRing color={ring} size={42} />
          </View>
        )}
        <Animated.View
          style={[
            scale,
            {
              width: 42,
              height: 42,
              borderRadius: r.outer,
              borderWidth: 2,
              borderColor: ringA(dim),
              alignItems: "center",
              justifyContent: "center",
              overflow: "visible",
              // The one blurred glow on the map: the pin you picked.
              boxShadow: selected ? `0 0 0 3px ${ringA(0.3)}, 0 0 26px -2px ${ringA(0.95)}` : undefined,
            },
          ]}
        >
          {/* Live pins: a crisp halo ring instead of a blurred glow. */}
          {live && !selected && (
            <View pointerEvents="none" style={{ position: "absolute", inset: -5, borderRadius: r.halo, borderWidth: 2, borderColor: ringA(0.3) }} />
          )}
          <LinearGradient colors={[c("ar-surface-3"), c("ar-void")]} style={{ position: "absolute", inset: 0, borderRadius: r.fill, opacity: dim }} />
          {failed ? (
            <Text className="font-hud text-[15px] font-bold" style={{ color: ringA(dim) }}>
              {pin.brandName.charAt(0)}
            </Text>
          ) : (
            <Image
              source={{ uri: pin.brandImageUrl }}
              onError={() => setFailed(true)}
              style={{ width: 30, height: 30, borderRadius: r.img, opacity: status === "collected" ? 0.45 : dim }}
              contentFit="cover"
            />
          )}
          {status === "collected" && <CornerFlag bg={c("rarity-legendary")} fg="hsl(30, 90%, 10%)" Icon={Check} />}
          {status === "locked" && <CornerFlag bg={c("ar-surface-3")} fg={c("ar-text-faint")} Icon={Lock} border={c("ar-line-bright")} />}
          {live && pin.autoCollect && <CornerFlag bg={c("ar-green")} fg={c("ar-green-ink")} Icon={Zap} />}
        </Animated.View>
        <LinearGradient colors={[ring, ringA(0)]} style={{ position: "absolute", bottom: -5, left: 20, width: 2, height: 9, borderRadius: 1, opacity: dead ? 0.3 : 0.85 }} />
      </Lift>
    </Pressable>
  );
});

/**
 * The bob. Only in-range pins render the animated version, so only they
 * subscribe to screen focus — otherwise every one of the ~80 pins re-rendered
 * whenever you switched tabs.
 */
function Lift({ floating, children }: { floating: boolean; children: ReactNode }) {
  if (!floating) return <View>{children}</View>;
  return <Bob>{children}</Bob>;
}

function Bob({ children }: { children: ReactNode }) {
  const motion = useDecorativeMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (motion) {
      y.value = withRepeat(withSequence(withTiming(-5, { duration: 1400, easing: Easing.inOut(Easing.ease) }), withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.ease) })), -1);
    } else y.value = withTiming(0);
  }, [motion, y]);
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={lift}>{children}</Animated.View>;
}

function CornerFlag({ bg, fg, Icon, border }: { bg: string; fg: string; Icon: typeof Check; border?: string }) {
  return (
    <View
      style={{
        position: "absolute",
        right: -5,
        top: -5,
        width: 17,
        height: 17,
        borderRadius: 9,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        // A dark edge reads like the old drop shadow without a blur pass.
        borderWidth: 1,
        borderColor: border ?? "rgba(0,0,0,0.55)",
      }}
    >
      <Icon size={10} strokeWidth={3.4} color={fg} />
    </View>
  );
}
