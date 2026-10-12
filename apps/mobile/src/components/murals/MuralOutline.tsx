import { useEffect } from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Path, Polygon } from "react-native-svg";

import { Text } from "~/components/ui/Text";
import { corners, type Outline, type Pt } from "~/lib/murals/localize";
import type { ArtKind } from "~/lib/murals/useMuralDetector";
import { useColors } from "~/theme/theme";

const APolygon = Animated.createAnimatedComponent(Polygon);
const APath = Animated.createAnimatedComponent(Path);

/**
 * ── MuralOutline (mobile) ──────────────────────────────────────────────────
 *
 * Port of wadzzoAR's MuralOutline: the detected mural's shape over the
 * camera — a perspective quad when the wall edges were found, else a box.
 *
 *   acquiring  dashed outline marching around the art
 *   locked     solid glowing outline + white corner brackets + "MURAL 92%"
 *   sweeping   frozen at lock, sliding with the turn; a pulsing dashed ghost
 *              with notches marks where it should land for this stop
 *
 * Corners are 8 shared values tweened on the UI thread, so the 1.6 Hz
 * detector still animates at 60 fps without re-rendering React.
 */

type Mode = "acquiring" | "locked" | "sweeping";

function mapToScreen(p: Pt, W: number, H: number, aspect: number): Pt {
  const dispW = W / H > aspect ? W : H * aspect;
  const dispH = W / H > aspect ? W / aspect : H;
  return { x: (W - dispW) / 2 + p.x * dispW, y: (H - dispH) / 2 + p.y * dispH };
}

function useCorner() {
  return { x: useSharedValue(0), y: useSharedValue(0) };
}

export function MuralOutline({
  outline,
  aspect,
  mode,
  kind,
  score,
  offsetX,
  targetOffsetX = null,
}: {
  outline: Outline | null;
  aspect: number;
  mode: Mode;
  kind: ArtKind;
  score: number;
  /** Sweeping: px the outline has slid with the turn (UI-thread value). */
  offsetX: SharedValue<number>;
  /** Sweeping: px offset where it should land for this stop. */
  targetOffsetX?: number | null;
}) {
  const { c } = useColors();
  const { width: W, height: H } = useWindowDimensions();
  const k = [useCorner(), useCorner(), useCorner(), useCorner()];
  const visible = useSharedValue(0);
  const march = useSharedValue(0);
  const ghost = useSharedValue(0.35);
  const solid = mode !== "acquiring";

  useEffect(() => {
    if (!outline) {
      visible.value = withTiming(0, { duration: 200 });
      return;
    }
    const first = visible.value < 0.05;
    corners(outline)
      .map((p) => mapToScreen(p, W, H, aspect))
      .forEach((p, i) => {
        // Jump on first sight, glide afterwards.
        k[i]!.x.value = first ? p.x : withTiming(p.x, { duration: 420, easing: Easing.out(Easing.cubic) });
        k[i]!.y.value = first ? p.y : withTiming(p.y, { duration: 420, easing: Easing.out(Easing.cubic) });
      });
    visible.value = withTiming(1, { duration: 200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the corner values are stable refs
  }, [outline, W, H, aspect]);

  useEffect(() => {
    if (solid) {
      cancelAnimation(march);
      march.value = 0;
    } else march.value = withRepeat(withTiming(-36, { duration: 900, easing: Easing.linear }), -1, false);
  }, [solid, march]);

  useEffect(() => {
    if (mode === "sweeping") ghost.value = withRepeat(withTiming(0.85, { duration: 600 }), -1, true);
    else {
      cancelAnimation(ghost);
      ghost.value = 0;
    }
  }, [mode, ghost]);

  const points = (dx: number) => {
    "worklet";
    return k.map((p) => `${p.x.value + dx},${p.y.value}`).join(" ");
  };

  const outlineProps = useAnimatedProps(() => ({ points: points(offsetX.value), strokeDashoffset: march.value }));
  const fillProps = useAnimatedProps(() => ({ points: points(offsetX.value) }));
  const ghostProps = useAnimatedProps(() => ({ points: points(targetOffsetX ?? 0), opacity: ghost.value }));
  const bracketProps = useAnimatedProps(() => {
    const pts = k.map((p) => ({ x: p.x.value + offsetX.value, y: p.y.value }));
    let d = "";
    for (let i = 0; i < 4; i++) {
      const p = pts[i]!;
      const prev = pts[(i + 3) % 4]!;
      const next = pts[(i + 1) % 4]!;
      const seg = (q: { x: number; y: number }) => {
        const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        const l = Math.min(18, len / 3);
        return `${p.x + ((q.x - p.x) / len) * l},${p.y + ((q.y - p.y) / len) * l}`;
      };
      d += `M${seg(prev)} L${p.x},${p.y} L${seg(next)} `;
    }
    return { d };
  });
  const wrapStyle = useAnimatedStyle(() => ({ opacity: visible.value }));
  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(6, Math.min(k[0]!.x.value + offsetX.value, W - 130)) }, { translateY: Math.max(40, k[0]!.y.value) - 28 }],
  }));

  const epic = c("rarity-epic");
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, width: W, height: H }, wrapStyle]}>
      <Svg width={W} height={H}>
        {mode === "sweeping" && targetOffsetX != null && <APolygon animatedProps={ghostProps} fill="none" stroke={epic} strokeWidth={2} strokeDasharray="6 8" />}
        <APolygon animatedProps={fillProps} fill={c("rarity-epic", solid ? 0.1 : 0.05)} />
        <APolygon animatedProps={outlineProps} fill="none" stroke={epic} strokeWidth={solid ? 3 : 2.5} strokeLinejoin="round" strokeDasharray={solid ? undefined : "10 8"} />
        {solid && <APath animatedProps={bracketProps} fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />}
      </Svg>
      <Animated.View style={[{ position: "absolute", left: 0, top: 0 }, chipStyle]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, borderColor: c("rarity-epic", 0.6), backgroundColor: "rgba(10,18,14,0.82)", paddingHorizontal: 8, paddingVertical: 3 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: solid ? c("ar-green-hot") : epic }} />
          <Text className="font-hud text-[10px] font-bold uppercase tracking-[1.4px] text-white">{kind}</Text>
          <Text className="font-hud text-[10px] font-bold" style={{ color: epic }}>
            {Math.round(score * 100)}%
          </Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}
