import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  makeMutable,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useDecorativeMotion } from "~/lib/motion";
import { cn } from "~/lib/utils";
import { useColors } from "~/theme/theme";

/**
 * Port of wadzzoAR/src/components/ui/Skeleton.tsx: placeholders shaped like
 * the content that's coming, with the green sweep (1.6s ease-in-out) that
 * separates "arriving" from "broken".
 *
 * On the web every `.ar-skeleton::after` starts on the same frame, so the
 * whole screen shimmers as one. Natively each bar used to start its own loop
 * whenever it laid out, sweeping its own width — narrow bars crawled, wide
 * ones raced, nothing lined up. Now one shared clock moves a single band of
 * light across the screen, and each skeleton just shows the part of that
 * band that's over it: all in step, and one animation instead of dozens.
 */

/** Width of the light band, and the one clock (0 → 1) that sweeps it. */
const BAND = 220;
const SWEEP_MS = 1600;
const clock = makeMutable(0);
let running = 0;

function startClock() {
  running += 1;
  if (running === 1) {
    clock.value = 0;
    clock.value = withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.ease) }), -1);
  }
}
function stopClock() {
  running = Math.max(0, running - 1);
  if (running === 0) cancelAnimation(clock);
}

/** One shimmering block. Everything else here is composed from it. */
export function Skeleton({ className, style }: { className?: string; style?: StyleProp<ViewStyle> }) {
  const { c } = useColors();
  const live = useDecorativeMotion();
  const { width: screenW } = useWindowDimensions();
  const ref = useRef<View>(null);
  const [x, setX] = useState<number | null>(null);

  useEffect(() => {
    if (!live) return;
    startClock();
    return stopClock;
  }, [live]);

  // The band travels from just off the left edge of the screen to just off
  // the right; this skeleton sees it shifted by its own screen position.
  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: -BAND + clock.value * (screenW + 2 * BAND) - (x ?? 0) }],
  }));

  return (
    <View
      ref={ref}
      aria-hidden
      onLayout={() => ref.current?.measureInWindow((wx) => setX(wx))}
      className={cn("overflow-hidden rounded-ar border border-ar-line bg-ar-surface-2", className)}
      style={style}
    >
      {x != null && live && (
        <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, left: 0, width: BAND }, sweep]}>
          <LinearGradient
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            colors={[c("ar-green", 0), c("ar-green", 0.07), c("ar-green", 0.13), c("ar-green", 0.07), c("ar-green", 0)]}
            locations={[0, 0.45, 0.5, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <View className={cn("gap-1.5", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-2.5 rounded-full", i === lines - 1 ? "w-2/5" : "w-full")} />
      ))}
    </View>
  );
}

export function BrandRowSkeleton() {
  return (
    <View className="flex-row items-center gap-3 rounded-ar border border-ar-line bg-ar-surface p-3">
      <Skeleton className="h-[52px] w-[52px] rounded-[14px]" />
      <View className="flex-1">
        <Skeleton className="h-3 w-1/2 rounded-full" />
        <Skeleton className="mt-2 h-2.5 w-4/5 rounded-full" />
        <Skeleton className="mt-2 h-2 w-1/3 rounded-full" />
      </View>
      <Skeleton className="h-8 w-[74px] rounded-full" />
    </View>
  );
}

/** A HoloCard in a grid — exactly the card's 5:7 aspect. */
export function CardSkeleton() {
  return <Skeleton className="w-full rounded-[14px]" style={{ aspectRatio: 5 / 7 }} />;
}

export function NearbyCardSkeleton() {
  return (
    <View className="w-[168px] flex-row items-center gap-2.5 rounded-ar border border-ar-line bg-ar-surface p-2">
      <Skeleton className="h-[46px] w-[34px] rounded-[8px]" />
      <View className="flex-1">
        <Skeleton className="h-2.5 w-4/5 rounded-full" />
        <Skeleton className="mt-1.5 h-2 w-3/5 rounded-full" />
        <Skeleton className="mt-1.5 h-2 w-1/2 rounded-full" />
      </View>
    </View>
  );
}

export function StatRowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View className="flex-row rounded-ar border border-ar-line bg-ar-surface">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} className={cn("flex-1 items-center px-3 py-2.5", i > 0 && "border-l border-ar-line")}>
          <Skeleton className="h-4 w-10 rounded-full" />
          <Skeleton className="mt-1.5 h-2 w-12 rounded-full" />
        </View>
      ))}
    </View>
  );
}
