import { Canvas, Circle, Group, RadialGradient, SweepGradient, vec } from "@shopify/react-native-skia";
import { View } from "react-native";

import { PulseRing } from "~/components/ui/PulseDot";
import type { GeoFix } from "~/lib/ar/types";
import { useColors } from "~/theme/theme";

/** The puck's box: just the heading cone (r = 23), nothing wider. */
const CORE = 46;

/**
 * GPS accuracy disc. Its own marker so it can sit *under* the pins, while the
 * puck itself (below) is drawn above them.
 */
export function UserAccuracy({ fix, metersPerPixel }: { fix: GeoFix; metersPerPixel: number }) {
  const { c } = useColors();
  const accuracyPx = Math.max(26, Math.min(fix.accuracy / metersPerPixel, 190));
  return (
    <View
      pointerEvents="none"
      style={{ width: accuracyPx, height: accuracyPx, borderRadius: accuracyPx / 2, borderWidth: 1, borderColor: c("ar-green", 0.35), backgroundColor: c("ar-green", 0.1) }}
    />
  );
}

/**
 * Port of the web's UserPuck: sonar (faster while moving), heading cone, and
 * the puck itself. Kept to a CORE-sized box: it's drawn above the pins, and
 * on iOS a marker's box swallows taps even with pointerEvents="none", so any
 * larger box would block pins near the user.
 */
export function UserPuck({ fix, heading }: { fix: GeoFix; heading: number | null }) {
  const { c } = useColors();
  const moving = (fix.speed ?? 0) > 0.6;
  const h = heading ?? fix.heading;
  const size = CORE;
  const mid = size / 2;
  return (
    <View pointerEvents="none" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <PulseRing color={c("ar-green-hot")} size={36} duration={moving ? 2400 : 4000} />
      {h != null && (
        <Canvas style={{ position: "absolute", width: size, height: size }}>
          <Group transform={[{ rotate: ((h - 90 - 26) * Math.PI) / 180 }]} origin={vec(mid, mid)}>
            <Circle cx={mid} cy={mid} r={23}>
              <SweepGradient c={vec(mid, mid)} colors={[c("ar-green-hot", 0.55), c("ar-green-hot", 0), c("ar-green-hot", 0)]} positions={[0, 52 / 360, 1]} />
            </Circle>
          </Group>
          <Circle cx={mid} cy={mid} r={23} blendMode="dstIn">
            <RadialGradient c={vec(mid, mid)} r={23} colors={["black", "black", "transparent"]} positions={[0, 0.4, 1]} />
          </Circle>
        </Canvas>
      )}
      <View
        style={{
          width: 23,
          height: 23,
          borderRadius: 12,
          backgroundColor: c("ar-green-hot"),
          // White ring as a border rather than a (masked) spread shadow.
          borderWidth: 3,
          borderColor: "rgba(255,255,255,0.92)",
        }}
      />
    </View>
  );
}

export function metersPerPixel(latitude: number, zoom: number): number {
  return (156_543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
}
