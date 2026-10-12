import { useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { sheetMounted, sheetUnmounted, whenNoSheet } from "~/lib/sheets";
import { useColors } from "~/theme/theme";

const SPRING = { stiffness: 420, damping: 30, mass: 0.8 };
const CLOSE = { duration: 170, easing: Easing.bezier(0.4, 0, 0.9, 0.6) };

/**
 * ── Dialog ─────────────────────────────────────────────────────────────────
 *
 * A centred card over a dimmed backdrop — for choices that deserve the
 * middle of the screen (the camera launcher), where BottomSheet is for
 * details. Pops in with a spring (scale 0.92 → 1, fade, a small rise) and
 * eases out. Tap outside or the Android back button closes it.
 *
 * It's a native Modal like BottomSheet, so it takes part in the same "one
 * modal at a time" queue (~/lib/sheets): stacking two UIKit presentations is
 * what leaves an invisible layer swallowing every tap.
 */
export function Dialog({
  open,
  onClose,
  onClosed,
  children,
  maxWidth = 400,
}: {
  open: boolean;
  onClose: () => void;
  /** After the close animation, once the dialog is fully gone. */
  onClosed?: () => void;
  children: ReactNode;
  maxWidth?: number;
}) {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const p = useSharedValue(0);

  const unmount = () => {
    setMounted(false);
    onClosed?.();
  };

  useEffect(() => {
    if (!mounted) return;
    sheetMounted();
    return sheetUnmounted;
  }, [mounted]);

  useEffect(() => {
    if (open && !mounted) {
      let cancelled = false;
      whenNoSheet(() => {
        if (!cancelled) setMounted(true);
      });
      return () => {
        cancelled = true;
      };
    }
    if (open) p.set(withSpring(1, SPRING));
    else if (mounted)
      p.set(
        withTiming(0, CLOSE, (done) => {
          if (done) runOnJS(unmount)();
        }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  const backdrop = useAnimatedStyle(() => ({ opacity: p.get() }));
  const card = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0, 0.6, 1], [0, 1, 1], "clamp"),
    transform: [{ scale: 0.92 + 0.08 * p.get() }, { translateY: (1 - p.get()) * 14 }],
  }));

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c("ar-void", 0.78) }, backdrop]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }}>
        <Animated.View
          accessibilityViewIsModal
          style={[
            card,
            {
              alignSelf: "center",
              width: "100%",
              maxWidth,
              maxHeight: height - insets.top - insets.bottom - 24,
              borderRadius: 28,
              borderWidth: 1,
              borderColor: c("ar-line"),
              backgroundColor: c("ar-surface"),
              overflow: "hidden",
            },
          ]}
        >
          <ScrollView bounces={false} contentContainerStyle={{ paddingVertical: 16 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
