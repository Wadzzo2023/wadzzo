import { Check, Loader2, Smartphone, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { SWEEP_SIDE_DEG, type RejectCode } from "~/lib/murals/constants";
import type { SweepStep } from "~/lib/murals/useMuralSweep";
import { useColors } from "~/theme/theme";

/**
 * ── Murals camera parts ────────────────────────────────────────────────────
 *
 * Native ports of wadzzoAR's MuralViewfinder, SweepGauge and ScanVerifying —
 * same states, same copy, same epic-purple accent (docs/murals/plan.md §6).
 */

const BOX = 248;
const CORNERS = [
  "M3 66V23a20 20 0 0 1 20-20h43",
  "M182 3h43a20 20 0 0 1 20 20v43",
  "M245 182v43a20 20 0 0 1-20 20h-43",
  "M66 245H23a20 20 0 0 1-20-20v-43",
];

export function MuralViewfinder({ state, score }: { state: "searching" | "locked" | "sweeping" | "idle"; score: number }) {
  const { c } = useColors();
  const locked = state === "locked" || state === "sweeping";
  const boxStyle = useAnimatedStyle(() => ({ transform: [{ scale: withTiming(locked ? 0.94 : 1, { duration: 260 }) }] }));
  const meterStyle = useAnimatedStyle(() => ({ width: withTiming(Math.round(Math.min(1, score) * 148), { duration: 200 }) }));

  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: "42%", alignItems: "center", transform: [{ translateY: -BOX / 2 }] }}>
      <Animated.View style={[{ width: BOX, height: BOX }, boxStyle]}>
        <Svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`}>
          {CORNERS.map((d) => (
            <Path key={d} d={d} stroke={locked ? c("rarity-epic") : "rgba(255,255,255,0.6)"} strokeWidth={locked ? 5 : 3.5} strokeLinecap="round" fill="none" />
          ))}
        </Svg>
      </Animated.View>
      <View style={{ marginTop: 16, height: 3, width: 148, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", opacity: state === "searching" ? 1 : 0, overflow: "hidden" }}>
        <Animated.View style={[{ height: 3, borderRadius: 2, backgroundColor: c("rarity-epic") }, meterStyle]} />
      </View>
    </View>
  );
}

const RANGE = SWEEP_SIDE_DEG * 1.6;
const pos = (deg: number) => 50 + (Math.max(-RANGE, Math.min(RANGE, deg)) / RANGE) * 50;
const STOPS: { slot: 0 | 1 | 2; at: number; label: string; step: SweepStep }[] = [
  { slot: 0, at: -SWEEP_SIDE_DEG, label: "Left", step: "left" },
  { slot: 1, at: 0, label: "Centre", step: "centre" },
  { slot: 2, at: SWEEP_SIDE_DEG, label: "Right", step: "right" },
];

export function SweepGauge({ delta, step, captured }: { delta: number; step: SweepStep; captured: [boolean, boolean, boolean] }) {
  const { c } = useColors();
  // Plain % position: `delta` re-renders us anyway, and a measured width read
  // inside a worklet stayed at its first value (0) on device.
  return (
    <View style={{ height: 56, width: "100%", maxWidth: 272, alignSelf: "center" }}>
      <View style={{ position: "absolute", left: 0, right: 0, top: 27, height: 3, borderRadius: 2, backgroundColor: c("ar-text", 0.15) }} />
      {STOPS.map((s) => {
        const done = captured[s.slot];
        const next = s.step === step;
        return (
          <View key={s.slot} style={{ position: "absolute", top: 0, left: `${pos(s.at)}%`, width: 50, marginLeft: -25, alignItems: "center" }}>
            <Text className="font-hud text-[9px] font-bold uppercase tracking-[1.4px] text-ar-faint">{s.label}</Text>
            <View
              style={{
                marginTop: 9,
                width: 12,
                height: 12,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: done || next ? c("rarity-epic") : c("ar-text", 0.4),
                backgroundColor: done ? c("rarity-epic") : "transparent",
              }}
            />
          </View>
        );
      })}
      <View style={{ position: "absolute", top: 18, left: `${pos(delta)}%`, marginLeft: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
        <Smartphone size={13} strokeWidth={2.6} color="#0A120E" />
      </View>
    </View>
  );
}

const CHECKS = ["Street art", "Right place", "Not a screen"] as const;

export function failedCheck(code: RejectCode): number | null {
  if (code === "NOT_ART" || code === "UNSAFE") return 0;
  if (code === "GPS_WEAK" || code === "NO_SWEEP" || code === "SESSION_EXPIRED") return 1;
  if (code === "SCREEN" || code === "WEB_COPY") return 2;
  return null;
}

export function ScanVerifying({ frames, outcome }: { frames: string[]; outcome: null | "ok" | { failed: number | null } }) {
  const { c } = useColors();
  const [paced, setPaced] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setPaced(1), 550);
    const b = setTimeout(() => setPaced(2), 1100);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  const rowState = (i: number): "wait" | "spin" | "ok" | "fail" => {
    if (outcome && outcome !== "ok" && outcome.failed === i) return "fail";
    if (outcome && outcome !== "ok" && outcome.failed != null && i > outcome.failed) return "wait";
    if (outcome === "ok" || i < paced) return "ok";
    return i === paced ? "spin" : "wait";
  };

  return (
    <Animated.View entering={FadeInDown.duration(220)} style={{ width: "100%", maxWidth: 304 }}>
      <Glass style={{ borderRadius: 22, padding: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
          {frames.map((uri, i) => (
            <Image
              key={uri}
              source={{ uri }}
              style={{ width: 56, height: 74, borderRadius: 10, borderWidth: 1, borderColor: i === 1 ? c("rarity-epic", 0.7) : "rgba(255,255,255,0.25)", transform: [{ rotate: `${(i - 1) * 4}deg` }] }}
            />
          ))}
        </View>
        <Text className="font-hud mt-4 text-center text-[12.5px] font-bold uppercase tracking-[1.5px] text-ar-text">Checking your scan</Text>
        <View style={{ marginTop: 12, gap: 8 }}>
          {CHECKS.map((label, i) => {
            const st = rowState(i);
            const tone = st === "ok" ? c("ar-green-hot") : st === "fail" ? c("ar-danger") : c("ar-text-faint");
            return (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: tone, alignItems: "center", justifyContent: "center" }}>
                  {st === "ok" && <Check size={12} strokeWidth={3} color={tone} />}
                  {st === "fail" && <X size={12} strokeWidth={3} color={tone} />}
                  {st === "spin" && <Loader2 size={12} strokeWidth={2.6} color={tone} />}
                </View>
                <Text className="text-[12.5px]" style={{ color: st === "wait" ? c("ar-text-faint") : c("ar-text") }}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      </Glass>
    </Animated.View>
  );
}
