import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

import { Text } from "~/components/ui/Text";
import { formatDistance } from "~/lib/ar/geo";
import { useDecorativeMotion } from "~/lib/motion";
import { useColors } from "~/theme/theme";

/**
 * HUD pieces over the Viro scene — ports of the web AR scene's DOM chrome
 * (`ArScene.tsx`: Reticle, ArRadar, CompassStrip, EdgeArrow). They take
 * plain numbers (relative yaw, distance, heading), computed by the screen
 * from the camera pose Viro reports.
 */

/**
 * Centre reticle — the web's (`ArScene.tsx` Reticle): four corner brackets and
 * a centre dot, 64 px. Still: it never rotates. Idle it's a faint white; on a
 * pin it springs in (1.12 → 1) and turns gold; when that pin can be captured
 * it turns green.
 */
export function Reticle({ locked, armed }: { locked: boolean; armed: boolean }) {
  const { c } = useColors();
  const s = useSharedValue(1.12);
  useEffect(() => {
    s.value = withSpring(locked ? 1 : 1.12, { stiffness: 300, damping: 22 });
  }, [locked, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const color = armed ? c("ar-green-hot") : locked ? c("rarity-legendary") : "rgba(255,255,255,0.4)";
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={style}>
        <Svg width={64} height={64} viewBox="0 0 64 64">
          {["M2 20V7a5 5 0 0 1 5-5h13", "M44 2h13a5 5 0 0 1 5 5v13", "M62 44v13a5 5 0 0 1-5 5H44", "M20 62H7a5 5 0 0 1-5-5V44"].map((d) => (
            <Path key={d} d={d} stroke={color} strokeWidth={2.2} strokeLinecap="round" fill="none" />
          ))}
          <Circle cx={32} cy={32} r={1.8} fill={color} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Radar: 86px disc, view-relative ("up" = where you're looking), 75 m ring. */
export function Radar({ items }: { items: { id: string; yaw: number; distance: number; capturable: boolean; focused: boolean; color: string }[] }) {
  const { c } = useColors();
  const R = 43;
  const MAX = 150;
  return (
    <View pointerEvents="none" style={{ width: 86, height: 86, borderRadius: 43, overflow: "hidden", borderWidth: 1, borderColor: c("ar-line", 0.9), backgroundColor: c("ar-void", 0.55) }}>
      <Svg width={86} height={86}>
        <Circle cx={R} cy={R} r={R * 0.78} stroke={c("ar-green", 0.25)} strokeWidth={1} fill="none" />
        <Circle cx={R} cy={R} r={R * 0.4} stroke={c("ar-green", 0.2)} strokeWidth={1} fill="none" />
        {/* The view cone. */}
        <Path d={`M${R} ${R} L${R - 22} ${R - 38} A 44 44 0 0 1 ${R + 22} ${R - 38} Z`} fill={c("ar-green", 0.12)} />
        {items.map((i) => {
          const d = Math.min(i.distance, MAX) / MAX;
          const a = (i.yaw * Math.PI) / 180;
          const x = R + Math.sin(a) * d * R * 0.92;
          const y = R - Math.cos(a) * d * R * 0.92;
          return <Circle key={i.id} cx={x} cy={y} r={i.focused ? 4 : 3} fill={i.capturable ? i.color : c("ar-locked")} stroke={i.focused ? "#fff" : "none"} strokeWidth={1} />;
        })}
        <Circle cx={R} cy={R} r={3} fill={c("ar-green-hot")} />
      </Svg>
    </View>
  );
}

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** Compass strip: a 120° window of ticks and cardinal letters around heading. */
export function CompassStrip({ heading, top }: { heading: number | null; top: number }) {
  const { c } = useColors();
  if (heading == null) return null;
  const FOV = 120;
  const marks: { deg: number; label?: string }[] = [];
  for (let d = 0; d < 360; d += 15) marks.push({ deg: d, label: d % 45 === 0 ? POINTS[d / 45] : undefined });
  return (
    <View pointerEvents="none" style={{ position: "absolute", top, left: 0, right: 0, height: 24, overflow: "hidden", zIndex: 20 }}>
      {marks.map((m) => {
        const off = ((m.deg - heading + 540) % 360) - 180;
        if (Math.abs(off) > FOV / 2) return null;
        return (
          <View key={m.deg} style={{ position: "absolute", left: `${50 + (off / FOV) * 100}%`, top: 0, alignItems: "center", transform: [{ translateX: -10 }], width: 20 }}>
            {m.label ? (
              <Text className="font-hud text-[10px] font-bold" style={{ color: m.label === "N" ? c("ar-green-hot") : "rgba(255,255,255,0.55)", letterSpacing: 1.6 }}>
                {m.label}
              </Text>
            ) : (
              <View style={{ width: 1, height: 6, marginTop: 4, backgroundColor: "rgba(255,255,255,0.35)" }} />
            )}
          </View>
        );
      })}
      <View style={{ position: "absolute", left: "50%", top: 15, width: 1.5, height: 6, marginLeft: -0.75, backgroundColor: c("ar-green-hot") }} />
    </View>
  );
}

/** Arrows at the screen edge pointing to pins outside the view. */
export function EdgeArrows({ items }: { items: { id: string; yaw: number; distance: number; color: string }[] }) {
  const left = items.filter((i) => i.yaw < -35).sort((a, b) => a.distance - b.distance)[0];
  const right = items.filter((i) => i.yaw > 35).sort((a, b) => a.distance - b.distance)[0];
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: "45%", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10 }}>
      <View>{left && <Edge side="left" color={left.color} distance={left.distance} />}</View>
      <View>{right && <Edge side="right" color={right.color} distance={right.distance} />}</View>
    </View>
  );
}

function Edge({ side, color, distance }: { side: "left" | "right"; color: string; distance: number }) {
  const liveX = useDecorativeMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (!liveX) {
      cancelAnimation(x);
      return;
    }
    x.value = withRepeat(withTiming(side === "left" ? -5 : 5, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [side, x, liveX]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <Animated.View style={[{ alignItems: "center", gap: 2 }, style]}>
      <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: color, backgroundColor: "rgba(6,16,10,0.55)" }}>
        <Icon size={20} strokeWidth={2.6} color={color} />
      </View>
      <Text className="font-hud text-[9.5px] font-bold text-white" style={{ textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 3 }}>
        {formatDistance(distance)}
      </Text>
    </Animated.View>
  );
}
