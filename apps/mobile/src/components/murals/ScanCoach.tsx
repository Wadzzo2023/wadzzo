import { ArrowLeft, ArrowRight, Check, Footprints, Frame, Gauge, Hand, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ArButton } from "~/components/ui/ArButton";
import { Dialog } from "~/components/ui/Dialog";
import { Text } from "~/components/ui/Text";
import { useDecorativeMotion } from "~/lib/motion";
import { persistStorage } from "~/lib/storage";
import type { SweepStep } from "~/lib/murals/useMuralSweep";
import { useColors } from "~/theme/theme";

/**
 * ── Scan coach ─────────────────────────────────────────────────────────────
 *
 * Everything that teaches the turn after a mural locks:
 *
 *   SweepDemo   — an animated top-down drawing: you, your phone's view and
 *                 the wall: hold on the middle, turn left, then right, with
 *                 each photo spot lighting up as it's "taken".
 *   ScanCoach   — the "How to scan" dialog built around it. Opens by itself
 *                 the first time Murals is used, and from the ? button.
 *   TurnPrompt  — the live instruction during the turn: a big arrow with a
 *                 progress ring, and "other way" / "slow down" warnings.
 */

// ── First-run flag ──────────────────────────────────────────────────────────

export const useScanCoachSeen = create<{ seen: boolean; markSeen: () => void }>()(
  persist((set) => ({ seen: false, markSeen: () => set({ seen: true }) }), { name: "wadzzo-mural-coach", storage: persistStorage }),
);

// ── SweepDemo ───────────────────────────────────────────────────────────────

const W = 280;
const H = 172;
/** Where you stand; the phone's view turns around this point. */
const PIVOT = { x: 140, y: 146 };
const WALL_Y = 26;
/** Angle from the pivot to each photo spot on the wall (degrees, + = right). */
const TURN_DEG = 26;
/** Room under the drawing for the stage label. */
const LABEL_H = 26;
const SPOT_X = { left: PIVOT.x - Math.tan((TURN_DEG * Math.PI) / 180) * (PIVOT.y - WALL_Y), centre: PIVOT.x, right: PIVOT.x + Math.tan((TURN_DEG * Math.PI) / 180) * (PIVOT.y - WALL_Y) };

type DemoStage = { key: "point" | "centre" | "left" | "right"; label: string; angle: number; ms: number };
const STAGES: DemoStage[] = [
  { key: "point", label: "Point at the mural", angle: 0, ms: 1300 },
  { key: "centre", label: "Hold steady — photo 1", angle: 0, ms: 1100 },
  { key: "left", label: "Turn left — photo 2", angle: -TURN_DEG, ms: 1700 },
  { key: "right", label: "Then right — photo 3", angle: TURN_DEG, ms: 2200 },
];

export function SweepDemo({ width = W }: { width?: number }) {
  const { c } = useColors();
  const live = useDecorativeMotion();
  const [i, setI] = useState(0);
  const angle = useSharedValue(0);
  const stage = STAGES[live ? i : 0]!;

  /** The phone has arrived for this stage (its photo spot lights then). */
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (!live) return;
    const ms = STAGES[i]!.ms;
    const land = setTimeout(() => setLanded(true), ms * 0.6);
    const next = setTimeout(() => {
      setLanded(false);
      setI((n) => (n + 1) % STAGES.length);
    }, ms);
    return () => {
      clearTimeout(land);
      clearTimeout(next);
    };
  }, [i, live]);
  useEffect(() => {
    angle.set(withTiming(stage.angle, { duration: Math.round(stage.ms * 0.55), easing: Easing.inOut(Easing.cubic) }));
  }, [stage, angle]);
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.get()}deg` }] }));

  // Spots taken so far in this loop, in scan order: middle (stage 1), left
  // (2), right (3) — each once the phone has got there (all three when
  // motion is off).
  const shot = (k: number) => !live || i > k || (i === k && landed);
  const taken = { centre: shot(1), left: shot(2), right: shot(3) };
  const purple = c("rarity-epic");
  const scale = width / W;

  return (
    <View style={{ width, height: H * scale + LABEL_H, alignSelf: "center" }}>
      {/* The wall with its mural, and the three photo spots. */}
      <Svg width={width} height={H * scale} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient id="mural" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#F472B6" />
            <Stop offset="0.35" stopColor={purple} />
            <Stop offset="0.65" stopColor="#35D7F2" />
            <Stop offset="1" stopColor="#F5B70A" />
          </LinearGradient>
        </Defs>
        <Rect x={12} y={WALL_Y - 14} width={W - 24} height={14} rx={3} fill={c("ar-text", 0.12)} />
        <Rect x={SPOT_X.left - 22} y={WALL_Y - 12} width={SPOT_X.right - SPOT_X.left + 44} height={10} rx={2} fill="url(#mural)" opacity={0.9} />
        {(["left", "centre", "right"] as const).map((k) => (
          <G key={k}>
            <Circle cx={SPOT_X[k]} cy={WALL_Y + 10} r={8} fill={taken[k] ? purple : "transparent"} stroke={taken[k] ? purple : c("ar-text", 0.45)} strokeWidth={2} />
            {taken[k] && <Path d={`M${SPOT_X[k] - 3.5} ${WALL_Y + 10} l2.5 2.5 l4.5 -5`} stroke="#fff" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          </G>
        ))}
        {/* You, from above: shoulders and head. */}
        <Ellipse cx={PIVOT.x} cy={PIVOT.y + 12} rx={22} ry={10} fill={c("ar-text", 0.18)} />
        <Circle cx={PIVOT.x} cy={PIVOT.y + 8} r={9} fill={c("ar-text", 0.35)} />
        {/* Feet stay put. */}
        <Path d={`M${PIVOT.x - 10} ${PIVOT.y + 26} h6 M${PIVOT.x + 4} ${PIVOT.y + 26} h6`} stroke={c("ar-text", 0.35)} strokeWidth={3} strokeLinecap="round" />
      </Svg>

      {/* The phone and what it sees — this part turns. */}
      <Animated.View style={[{ position: "absolute", width, height: H * scale, transformOrigin: `${(PIVOT.x / W) * 100}% ${(PIVOT.y / H) * 100}%` }, turn]}>
        <Svg width={width} height={H * scale} viewBox={`0 0 ${W} ${H}`}>
          <Path d={`M${PIVOT.x - 6} ${PIVOT.y - 10} L${PIVOT.x - 46} ${WALL_Y + 2} L${PIVOT.x + 46} ${WALL_Y + 2} L${PIVOT.x + 6} ${PIVOT.y - 10} Z`} fill={purple} opacity={0.18} />
          <Path d={`M${PIVOT.x - 6} ${PIVOT.y - 10} L${PIVOT.x - 46} ${WALL_Y + 2} M${PIVOT.x + 6} ${PIVOT.y - 10} L${PIVOT.x + 46} ${WALL_Y + 2}`} stroke={purple} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.7} />
          <Rect x={PIVOT.x - 12} y={PIVOT.y - 14} width={24} height={7} rx={2.5} fill="#fff" stroke={purple} strokeWidth={1.5} />
        </Svg>
      </Animated.View>

      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" }}>
        <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: c("rarity-epic", 0.2) }}>
          <Text className="font-hud text-[10px] font-bold uppercase tracking-[1.4px]" style={{ color: purple }}>
            {live ? stage.label : "Middle · left · right"}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── ScanCoach ───────────────────────────────────────────────────────────────

const STEPS: { Icon: LucideIcon; title: string; body: string }[] = [
  { Icon: Frame, title: "Point at the mural and hold", body: "Fill the frame with it. When the corners turn purple, hold steady — the first photo is taken in the middle." },
  { Icon: ArrowLeft, title: "Turn a little left", body: "Like looking around, about a hand's width. The ring fills up and the second photo is taken." },
  { Icon: ArrowRight, title: "Then turn right", body: "Across the middle to the right side. The last photo is taken there, then it's checked." },
];
const TIPS: { Icon: LucideIcon; text: string }[] = [
  { Icon: Footprints, text: "Keep your feet still — turn the phone, not walk." },
  { Icon: Gauge, text: "Go slowly, about 2 seconds each way." },
  { Icon: Frame, text: "Keep the mural in view the whole time." },
];

export function ScanCoach({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { c } = useColors();
  return (
    <Dialog open={open} onClose={onClose}>
      <View style={{ paddingHorizontal: 20 }}>
        <Text className="font-hud text-[9.5px] font-semibold uppercase tracking-[2.4px] text-ar-faint">Murals</Text>
        <Text className="font-hud mt-1 text-[21px] font-bold leading-7 text-ar-text">How to scan a mural</Text>

        <View style={{ marginTop: 14, borderRadius: 18, borderWidth: 1, borderColor: c("ar-line"), backgroundColor: c("ar-surface-2"), paddingVertical: 12 }}>
          <SweepDemo width={260} />
        </View>

        <View style={{ marginTop: 14, gap: 12 }}>
          {STEPS.map(({ Icon, title, body }, n) => (
            <View key={title} style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: c("rarity-epic", 0.18), borderWidth: 1, borderColor: c("rarity-epic", 0.5) }}>
                <Text className="font-hud text-[12px] font-bold" style={{ color: c("rarity-epic") }}>
                  {n + 1}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon size={13} strokeWidth={2.4} color={c("ar-text")} />
                  <Text className="font-hud text-[12.5px] font-bold text-ar-text">{title}</Text>
                </View>
                <Text className="mt-0.5 text-[11.5px] leading-[17px] text-ar-dim">{body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 14, borderRadius: 14, padding: 12, gap: 8, backgroundColor: c("ar-surface-2") }}>
          {TIPS.map(({ Icon, text }) => (
            <View key={text} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon size={14} strokeWidth={2.3} color={c("rarity-legendary")} />
              <Text className="flex-1 text-[11.5px] leading-[16px] text-ar-dim">{text}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 16 }}>
          <ArButton variant="primary" size="lg" block icon={Check} onPress={onClose}>
            Got it
          </ArButton>
        </View>
      </View>
    </Dialog>
  );
}

// ── TurnPrompt ──────────────────────────────────────────────────────────────

const RING = 58;
const RING_R = 25;
const RING_C = 2 * Math.PI * RING_R;

/**
 * The live instruction while turning: which way, and how far (the ring fills
 * as you get there). The SweepGauge under it shows where you are and the
 * three photo spots.
 */
export function TurnPrompt({
  step,
  progress,
  wrongWay,
  tooFast,
}: {
  step: SweepStep;
  progress: number;
  wrongWay: boolean;
  tooFast: boolean;
}) {
  const { c } = useColors();
  const warn = wrongWay || tooFast;
  const accent = warn ? c("rarity-legendary") : c("rarity-epic");
  const Icon = step === "left" ? ArrowLeft : step === "right" ? ArrowRight : step === "centre" ? Hand : Check;
  const title =
    step === "done"
      ? "Got it"
      : tooFast
        ? "Slow down"
        : wrongWay
          ? "Other way"
          : step === "centre" || (step === "right" && progress >= 1)
            ? "Hold steady"
            : step === "left"
              ? "Now turn left"
              : "Now turn right";
  const sub =
    step === "done"
      ? "Checking your photos…"
      : tooFast
        ? "Turn gently — about 2 seconds each way."
        : step === "centre"
          ? "Keep the mural in the middle — photo 1 of 3."
          : step === "right" && progress >= 1
            ? "Right there — taking photo 3 of 3."
          : wrongWay
            ? step === "left"
              ? "Turn the phone to your left."
              : "Turn the phone to your right."
            : step === "left"
              ? "A little, like looking around — photo 2 of 3."
              : "Across the middle to the right — photo 3 of 3.";

  const filled = Math.max(0.02, Math.min(1, progress));

  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ width: RING, height: RING, alignItems: "center", justifyContent: "center" }}>
          <Svg width={RING} height={RING} style={{ position: "absolute" }}>
            <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={c("ar-text", 0.15)} strokeWidth={4} fill="none" />
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={RING_R}
              stroke={accent}
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${RING_C * filled} ${RING_C}`}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </Svg>
          <Icon size={24} strokeWidth={2.6} color={accent} />
        </View>
        <View style={{ flexShrink: 1, maxWidth: 200 }}>
          <Text className="font-hud text-[17px] font-bold uppercase tracking-[1.2px]" style={{ color: warn ? accent : c("ar-text") }} accessibilityLiveRegion="polite">
            {title}
          </Text>
          <Text className="mt-0.5 text-[11.5px] leading-[16px] text-ar-dim">{sub}</Text>
        </View>
      </View>

    </View>
  );
}
