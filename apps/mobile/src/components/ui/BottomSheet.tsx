import { useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { sheetMounted, sheetUnmounted, whenNoSheet } from "~/lib/sheets";
import { cn } from "~/lib/utils";
import { useColors } from "~/theme/theme";

/**
 * ── BottomSheet ────────────────────────────────────────────────────────────
 *
 * Port of the web's one overlay primitive: everything that isn't a full
 * screen arrives from the bottom, because that's the edge a thumb owns.
 * Same numbers as the web: spring 420/38/0.9 in, drag down past 90 px or
 * flick faster than 620 px/s to dismiss, elastic downward only.
 *
 * Motion is measured against the sheet's own height (not a fixed off-screen
 * distance), so the whole spring is on-screen on the way in and the close
 * eases out over the full slide. The backdrop follows the sheet's position,
 * so it dims and clears in step with it — including under a finger drag.
 */
const SPRING = { stiffness: 420, damping: 38, mass: 0.9 };

const CLOSE = { duration: 260, easing: Easing.bezier(0.4, 0, 0.9, 0.6) };
export function BottomSheet({
  open,
  onClose,
  onClosed,
  children,
  dismissible = true,
  maxHeight = "86%",
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** After the close animation, once the sheet is fully gone. */
  onClosed?: () => void;
  children: ReactNode;
  /** Drop the grabber + drag when the sheet is a required decision. */
  dismissible?: boolean;
  maxHeight?: `${number}%`;
  className?: string;
}) {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  // Off-screen until the sheet has been measured; `h` is its laid-out height.
  const y = useSharedValue(screenH);
  const h = useSharedValue(0);

  const unmount = () => {
    h.value = 0;
    setMounted(false);
    onClosed?.();
  };

  // Count this sheet while its Modal exists (see ~/lib/sheets).
  useEffect(() => {
    if (!mounted) return;
    sheetMounted();
    return sheetUnmounted;
  }, [mounted]);

  useEffect(() => {
    if (open && !mounted) {
      // Wait for any other sheet to be fully gone before presenting.
      let cancelled = false;
      whenNoSheet(() => {
        if (!cancelled) setMounted(true);
      });
      return () => {
        cancelled = true;
      };
    }
    if (open) {
      // Already measured (reopened before unmounting): spring from wherever it is.
      if (h.value > 0) y.value = withSpring(0, SPRING);
    } else if (mounted) {
      y.value = withTiming(h.value || screenH, CLOSE, (done) => {
        if (done) runOnJS(unmount)();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  const onLayout = (height: number) => {
    const first = h.value === 0;
    h.value = height;
    // First layout of an opening sheet: start exactly one sheet-height down.
    if (first && open) {
      y.value = height;
      y.value = withSpring(0, SPRING);
    }
  };

  const pan = Gesture.Pan()
    // Not while closing: a drag would cancel the close animation, so the
    // sheet would never unmount and every queued sheet would wait on it.
    .enabled(dismissible && open)
    .onUpdate((e) => {
      y.value = e.translationY > 0 ? e.translationY : e.translationY * 0.05;
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 620) runOnJS(onClose)();
      else y.value = withSpring(0, { ...SPRING, velocity: e.velocityY });
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: h.value > 0 ? interpolate(y.value, [0, h.value], [1, 0], "clamp") : 0,
  }));

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={dismissible ? onClose : () => undefined}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c("ar-void", 0.75) }, backdropStyle]}>
            <Pressable style={{ flex: 1 }} onPress={dismissible ? onClose : undefined} accessibilityLabel="Close" />
          </Animated.View>

          <GestureDetector gesture={pan}>
            <Animated.View
              onLayout={(e) => onLayout(e.nativeEvent.layout.height)}
              accessibilityViewIsModal
              className={cn("w-full overflow-hidden rounded-t-ar-xl border border-b-0 border-ar-line bg-ar-surface", className)}
              style={[
                sheetStyle,
                {
                  maxHeight,
                  paddingBottom: Math.max(18, insets.bottom),
                },
              ]}
            >
              {dismissible && (
                <View className="items-center pb-1 pt-2.5">
                  <View className="h-1 w-9 rounded-full bg-ar-line-bright" />
                </View>
              )}
              {children}
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}
