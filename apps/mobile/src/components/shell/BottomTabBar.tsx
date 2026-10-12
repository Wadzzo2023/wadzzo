import { Canvas, Circle, SweepGradient, vec } from "@shopify/react-native-skia";
import { LinearGradient } from "expo-linear-gradient";
import { router, usePathname } from "expo-router";
import { TabTrigger } from "expo-router/ui";
import { LayoutGrid, Map as MapIcon, Store, Trophy, type LucideIcon } from "lucide-react-native";
import { forwardRef, useEffect, useState } from "react";
import { Pressable, StyleSheet, View, type PressableProps } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { PackRing } from "~/components/murals/PackRing";
import { PulseRing } from "~/components/ui/PulseDot";
import { Text } from "~/components/ui/Text";
import { useBountyAttention } from "~/lib/api/queries";
import { useFeedback } from "~/lib/ar/feedback";
import { useDecorativeMotion } from "~/lib/motion";
import { useColors } from "~/theme/theme";

type Tab = { name: string; href: "/map" | "/collection" | "/bounty" | "/brands"; label: string; icon: LucideIcon };

export const LEFT_TABS: Tab[] = [
  { name: "map", href: "/map", label: "Map", icon: MapIcon },
  { name: "collection", href: "/collection", label: "Collection", icon: LayoutGrid },
];
// Profile is not a tab — it's the avatar in each header (ProfileButton),
// which freed this slot for Bounty. Same as the web.
export const RIGHT_TABS: Tab[] = [
  { name: "bounty", href: "/bounty", label: "Bounty", icon: Trophy },
  { name: "brands", href: "/brands", label: "Brands", icon: Store },
];

const BAR_H = 64;
const LAUNCHER = 62;

/**
 * The web's max(12px, safe-bottom) reads balanced in a browser, where the
 * inset is ~0. On a home-indicator iPhone the full 34pt under a 64pt row
 * leaves the icons riding high, so the row uses part of it — labels still
 * clear the home indicator.
 */
const barPaddingBottom = (insetBottom: number) => Math.max(12, insetBottom - 16);

/**
 * The bar floats over the screens (so the glass has something to blur).
 * Anything pinned to the bottom of a tab screen, or the end of its list,
 * clears it with this.
 */
export function useTabBarHeight() {
  const insets = useSafeAreaInsets();
  return BAR_H + barPaddingBottom(insets.bottom);
}

/**
 * ── BottomTabBar ───────────────────────────────────────────────────────────
 *
 * Port of the web console: edge-to-edge, rounded along its top, flush with
 * the true bottom of the screen. The AR launcher breaks out of the top on its
 * own plinth with a rotating conic ring — the one action the app exists for.
 * The lit plate is one element that springs between tabs (520/38/0.7), not
 * a cross-fade.
 */
export function BottomTabBar() {
  const { c, theme } = useColors();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { count: bountyAlerts } = useBountyAttention();
  const [slots, setSlots] = useState<Record<string, { x: number; w: number }>>({});

  const all = [...LEFT_TABS, ...RIGHT_TABS];
  const active = all.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  const slot = active ? slots[active.name] : undefined;

  const plateX = useSharedValue(0);
  const plateW = useSharedValue(0);
  const plateO = useSharedValue(0);
  useEffect(() => {
    if (!slot) {
      plateO.value = withTiming(0, { duration: 150 });
      return;
    }
    const spring = { stiffness: 520, damping: 38, mass: 0.7 };
    if (plateO.value === 0) {
      plateX.value = slot.x;
      plateW.value = slot.w;
    } else {
      plateX.value = withSpring(slot.x, spring);
      plateW.value = withSpring(slot.w, spring);
    }
    plateO.value = withTiming(1, { duration: 150 });
  }, [slot, plateX, plateW, plateO]);

  const plate = useAnimatedStyle(() => ({
    opacity: plateO.value,
    width: plateW.value - 8,
    transform: [{ translateX: plateX.value + 4 }],
  }));

  const measure = (name: string) => (e: { nativeEvent: { layout: { x: number; width: number } } }) => {
    const { x, width } = e.nativeEvent.layout;
    setSlots((s) => (s[name]?.x === x && s[name]?.w === width ? s : { ...s, [name]: { x, w: width } }));
  };

  const renderTab = (tab: Tab) => (
    <View key={tab.name} style={{ flex: 1 }} onLayout={measure(tab.name)}>
      <TabTrigger name={tab.name} href={tab.href} asChild>
        <TabButton tab={tab} dot={tab.name === "bounty" && bountyAlerts > 0} />
      </TabTrigger>
    </View>
  );

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
      <ArLauncher />
      <View
        className="rounded-t-ar-xl border border-b-0"
        style={{
          borderColor: c("ar-line", 0.7),
          paddingBottom: barPaddingBottom(insets.bottom),
        }}
      >
        {/* Translucent tint, not a live blur: a blur re-renders whatever
            moves behind it (the map) every frame. The 1px line is the old
            inset highlight without a masked boxShadow layer. */}
        <View pointerEvents="none" className="rounded-t-ar-xl" style={[StyleSheet.absoluteFill, { overflow: "hidden", backgroundColor: c("ar-surface", 0.88) }]}>
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.6)" }} />
        </View>
        <View style={{ height: BAR_H, flexDirection: "row", alignItems: "stretch", paddingHorizontal: 6 }}>
          <Animated.View
            pointerEvents="none"
            style={[
              plate,
              {
                position: "absolute",
                top: 7,
                bottom: 7,
                left: 0,
                borderRadius: 13,
                borderWidth: 1,
                borderColor: c("ar-green", 0.35),
                backgroundColor: c("ar-green", 0.12),
              },
            ]}
          />
          {LEFT_TABS.map(renderTab)}
          {/* Reserved footprint under the raised AR launcher. */}
          <View style={{ width: 74 }} />
          {RIGHT_TABS.map(renderTab)}
        </View>
      </View>
    </View>
  );
}

type TabButtonProps = PressableProps & { tab: Tab; dot?: boolean; isFocused?: boolean };

/** `TabTrigger asChild` hands this `onPress` and `isFocused`. */
const TabButton = forwardRef<View, TabButtonProps>(function TabButton({ tab, dot, isFocused, onPress, ...rest }, ref) {
  const { c } = useColors();
  const { tap } = useFeedback();
  const lift = useAnimatedStyle(() => ({
    transform: [
      { translateY: withSpring(isFocused ? -1 : 0, { stiffness: 480, damping: 26 }) },
      { scale: withSpring(isFocused ? 1.06 : 1, { stiffness: 480, damping: 26 }) },
    ],
  }));
  const Icon = tab.icon;
  return (
    <Pressable
      ref={ref}
      {...rest}
      onPress={(e) => {
        tap();
        onPress?.(e);
      }}
      accessibilityRole="tab"
      accessibilityLabel={dot ? `${tab.label}, new` : tab.label}
      accessibilityState={{ selected: !!isFocused }}
      style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 3 }}
    >
      <Animated.View style={lift}>
        <Icon
          size={21}
          strokeWidth={isFocused ? 2.4 : 1.9}
          color={isFocused ? c("ar-green-hot") : c("ar-text-faint")}
        />
        {dot && (
          <View
            style={{
              position: "absolute",
              right: -4,
              top: -2,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: c("ar-green-hot"),
            }}
          />
        )}
      </Animated.View>
      <Text
        className="font-hud font-semibold uppercase"
        style={{ fontSize: 9.5, letterSpacing: 1.3, color: isFocused ? c("ar-text") : c("ar-text-faint") }}
      >
        {tab.label}
      </Text>
    </Pressable>
  );
});

/** The raised launcher: conic ring (Skia), key-cap body, viewfinder "AR" glyph. */
function ArLauncher() {
  const { c } = useColors();
  const pathname = usePathname();
  // Keeps spinning (decided), but not while hidden, backgrounded or in Low Power Mode.
  const live = useDecorativeMotion();
  const arActive = pathname === "/camera" || pathname === "/ar" || pathname === "/scan";
  const spin = useSharedValue(0);
  useEffect(() => {
    if (!live) {
      cancelAnimation(spin);
      return;
    }
    spin.value = withRepeat(withTiming(spin.value + 1, { duration: 2400, easing: Easing.linear }), -1);
  }, [live, spin]);

  // The spinning arc lives INSIDE the button, just within its border (it used
  // to be a halo around the outside). Sized to the box inside the border.
  const border = arActive ? 2 : 1;
  const INNER = LAUNCHER - border * 2;
  const RING_W = 3;
  const center = vec(INNER / 2, INNER / 2);
  const transform = useDerivedValue(() => [{ rotate: spin.value * Math.PI * 2 }]);
  const pressed = useSharedValue(0);
  const body = useAnimatedStyle(() => ({ transform: [{ scale: 1 - pressed.value * 0.05 }] }));
  const { tap } = useFeedback();

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: -26, left: 0, right: 0, alignItems: "center", zIndex: 10 }}
    >
      <Pressable
        onPress={() => {
          tap();
          // The camera picker tab (AR / QR / Murals), not AR directly.
          router.navigate("/camera");
        }}
        onPressIn={() => (pressed.value = withTiming(1, { duration: 90 }))}
        onPressOut={() => (pressed.value = withTiming(0, { duration: 140 }))}
        accessibilityRole="button"
        accessibilityLabel="Open camera"
        accessibilityHint="Choose Augmented Reality, QR scan, or Murals"
        style={{ width: LAUNCHER, height: LAUNCHER, alignItems: "center", justifyContent: "center" }}
      >
        {arActive && <PulseRing color={c("ar-green-hot")} size={LAUNCHER} />}
        <Animated.View
          style={[
            body,
            {
              position: "absolute",
              inset: 0,
              borderRadius: LAUNCHER / 2,
              overflow: "hidden",
              borderWidth: border,
              borderColor: c("ar-green", arActive ? 0.75 : 0.6),
              alignItems: "center",
              justifyContent: "center",
            },
          ]}
        >
          <LinearGradient colors={[c("ar-surface-3"), c("ar-void")]} style={StyleSheet.absoluteFill} />
          <Canvas style={{ position: "absolute", width: INNER, height: INNER, opacity: arActive ? 1 : 0.85 }}>
            <Circle cx={INNER / 2} cy={INNER / 2} r={INNER / 2 - RING_W / 2 - 1.5} style="stroke" strokeWidth={RING_W} strokeCap="round">
              <SweepGradient
                c={center}
                transform={transform}
                origin={center}
                colors={[c("ar-green", 0), c("ar-green", 0.95), c("ar-green-hot"), c("ar-green-hot", 0), c("ar-green-hot", 0)]}
                positions={[0, 60 / 360, 110 / 360, 190 / 360, 1]}
              />
            </Circle>
          </Canvas>
          <ArGlyph />
        </Animated.View>
        {/* Mural pack "charging" the camera while it downloads. */}
        <PackRing size={LAUNCHER} />
      </Pressable>
    </View>
  );
}

function ArGlyph() {
  const { c } = useColors();
  return (
    <View style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
      <Svg width={30} height={30} viewBox="0 0 30 30" style={{ position: "absolute" }}>
        {[
          "M1 8V3.5A2.5 2.5 0 0 1 3.5 1H8",
          "M22 1h4.5A2.5 2.5 0 0 1 29 3.5V8",
          "M29 22v4.5a2.5 2.5 0 0 1-2.5 2.5H22",
          "M8 29H3.5A2.5 2.5 0 0 1 1 26.5V22",
        ].map((d) => (
          <Path key={d} d={d} stroke={c("ar-green-hot")} strokeWidth={1.7} strokeLinecap="round" fill="none" />
        ))}
      </Svg>
      <Text
        className="font-hud font-bold"
        style={{ fontSize: 13, color: c("ar-text"), textShadowColor: c("ar-green", 0.9), textShadowRadius: 8 }}
      >
        AR
      </Text>
    </View>
  );
}
