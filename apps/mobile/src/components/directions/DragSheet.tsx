import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "~/theme/theme";

const SPRING = { damping: 26, stiffness: 260, mass: 0.8 };

/**
 * ── DragSheet (mobile) ─────────────────────────────────────────────────────
 *
 * Port of the web's Directions sheet: snap points (a first snap of 0 = fit
 * the header), drag the header to move it, flick to the next snap, tap the
 * handle to cycle. At the last snap the body scrolls.
 */
export function DragSheet({
  snaps: raw,
  index,
  onIndexChange,
  header,
  children,
}: {
  snaps: number[];
  index: number;
  onIndexChange: (i: number) => void;
  header: ReactNode;
  children?: ReactNode;
}) {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const [headerH, setHeaderH] = useState(0);
  const snaps = raw[0] === 0 ? [headerH + insets.bottom, ...raw.slice(1)] : raw;
  const i = Math.min(index, snaps.length - 1);
  const height = useSharedValue(snaps[i] ?? 0);

  useEffect(() => {
    height.set(withSpring(snaps[i] ?? 0, SPRING));
    // Snap targets change with header size / screen; re-settle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, snaps.join(",")]);

  const settle = useCallback((next: number) => onIndexChange(next), [onIndexChange]);
  const start = useSharedValue(0);
  const list = snaps;
  const pan = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onStart(() => {
      start.set(height.get());
    })
    .onUpdate((e) => {
      const max = list[list.length - 1]!;
      height.set(Math.max(list[0]! * 0.6, Math.min(max, start.get() - e.translationY)));
    })
    .onEnd((e) => {
      const h = height.get();
      let best = 0;
      for (let k = 1; k < list.length; k++) if (Math.abs(list[k]! - h) < Math.abs(list[best]! - h)) best = k;
      if (Math.abs(e.velocityY) > 600) best = e.velocityY < 0 ? Math.min(list.length - 1, Math.max(best, i + 1)) : Math.max(0, Math.min(best, i - 1));
      height.set(withSpring(list[best]!, SPRING));
      runOnJS(settle)(best);
    });

  const style = useAnimatedStyle(() => ({ height: height.get() }));
  const full = i === snaps.length - 1;

  return (
    <Animated.View
      style={[
        { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: c("ar-line"), backgroundColor: c("ar-bg"), overflow: "hidden" },
        style,
      ]}
    >
      <GestureDetector gesture={pan}>
        <View onLayout={(e: LayoutChangeEvent) => setHeaderH(Math.ceil(e.nativeEvent.layout.height))} style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <Pressable
            onPress={() => onIndexChange(full ? 0 : i + 1)}
            accessibilityRole="button"
            accessibilityLabel={full ? "Collapse" : "Expand"}
            hitSlop={12}
            style={{ alignSelf: "center", marginBottom: 10 }}
          >
            <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: c("ar-line-bright", 0.7) }} />
          </Pressable>
          {header}
        </View>
      </GestureDetector>
      <ScrollView scrollEnabled={full} bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}>
        {children}
      </ScrollView>
    </Animated.View>
  );
}
