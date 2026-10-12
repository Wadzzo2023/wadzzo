import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Grid } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useColors } from "~/theme/theme";

const MARK = require("../../../assets/brand/wadzzo-mark.png");
const WORDMARK = ["W", "A", "D", "Z", "Z", "O"] as const;
const BOOT_LINES = [
  "Waking the collector",
  "Calibrating compass",
  "Triangulating position",
  "Scanning for nearby drops",
  "Syncing your collection",
] as const;

/** Beat boundaries in ms from mount — identical to the web. */
const T = { assemble: 320, stamp: 1_180, boot: 1_560, open: 3_180, done: 3_900 } as const;

type Phase = "ignite" | "assemble" | "stamp" | "boot" | "open";

/**
 * ── BootSequence ───────────────────────────────────────────────────────────
 *
 * Port of wadzzoAR's boot: an overlay above the live, already-mounting map,
 * so the last beat is a real reveal. Five beats — ignite (scanline, grid),
 * assemble (mark drops, W-A-D-Z-Z-O fly in with chromatic fringing), stamp
 * (AR plate slams, shockwave), boot (status lines type over a 5-segment
 * charge bar), open (the plate zooms out onto the map). Tap to skip; reduced
 * motion skips it entirely. Once per cold start.
 *
 * The web blurs glyphs in and out; animated blur isn't cheap on native
 * views, so opacity and scale carry those beats here.
 */
export function BootSequence({ onDone }: { onDone: () => void }) {
  const { c } = useColors();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("ignite");
  const [lineIndex, setLineIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (reduced) {
      finish();
      return;
    }
    const timers = [
      setTimeout(() => setPhase("assemble"), T.assemble),
      setTimeout(() => setPhase("stamp"), T.stamp),
      setTimeout(() => setPhase("boot"), T.boot),
      setTimeout(() => setPhase("open"), T.open),
      setTimeout(finish, T.done),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reduced, finish]);

  const perLine = (T.open - T.boot) / BOOT_LINES.length;

  useEffect(() => {
    if (phase !== "boot") return;
    const id = setInterval(() => setLineIndex((i) => Math.min(i + 1, BOOT_LINES.length - 1)), perLine);
    return () => clearInterval(id);
  }, [phase, perLine]);

  useEffect(() => {
    if (phase !== "boot") return;
    const target = BOOT_LINES[lineIndex] ?? "";
    setTyped("");
    let i = 0;
    const step = Math.max(12, (perLine * 0.55) / target.length);
    const id = setInterval(() => {
      i += 1;
      setTyped(target.slice(0, i));
      if (i >= target.length) clearInterval(id);
    }, step);
    return () => clearInterval(id);
  }, [phase, lineIndex, perLine]);

  const started = phase !== "ignite";
  const opening = phase === "open";

  // Whole plate: zoom + fade out on "open" (0.72s, ease [0.7,0,0.28,1]).
  const plate = useSharedValue(0);
  useEffect(() => {
    if (opening) plate.value = withTiming(1, { duration: 720, easing: Easing.bezier(0.7, 0, 0.28, 1) });
  }, [opening, plate]);
  const plateStyle = useAnimatedStyle(() => ({
    opacity: 1 - plate.value,
    transform: [{ scale: 1 + plate.value * 0.35 }],
  }));

  // Backdrop grid + glow.
  const back = useSharedValue(0);
  useEffect(() => {
    if (started) back.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.ease) });
  }, [started, back]);
  const gridStyle = useAnimatedStyle(() => ({ opacity: back.value * 0.9, transform: [{ scale: 1.25 - back.value * 0.25 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: back.value, transform: [{ scale: 0.5 + back.value * 0.5 }] }));

  // Ignition scanline: one pass top → bottom.
  const scan = useSharedValue(0);
  useEffect(() => {
    scan.value = withTiming(1, { duration: 440, easing: Easing.in(Easing.ease) });
  }, [scan]);
  const scanStyle = useAnimatedStyle(() => ({ top: `${-4 + scan.value * 108}%` }));

  // Shockwave on stamp.
  const shock = useSharedValue(0);
  useEffect(() => {
    if (phase === "stamp") {
      shock.value = 0;
      shock.value = withTiming(1, { duration: 1050, easing: Easing.out(Easing.ease) });
    }
  }, [phase, shock]);
  const shockStyle = useAnimatedStyle(() => ({
    opacity: shock.value === 0 ? 0 : 0.9 * (1 - shock.value),
    transform: [{ scale: 0.2 + shock.value * 5.8 }],
  }));

  const coins = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        id: i,
        left: [12, 78, 30, 88, 55, 6, 68][i]!,
        top: [22, 16, 74, 58, 88, 52, 34][i]!,
        size: [30, 22, 38, 18, 26, 34, 20][i]!,
        delay: i * 420,
      })),
    [],
  );

  if (reduced) return null;

  return (
    <Animated.View exiting={FadeOut.duration(150)} style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
      <Pressable
        onPress={finish}
        accessibilityRole="progressbar"
        accessibilityLabel="Loading Wadzzo AR. Tap to skip."
        style={StyleSheet.absoluteFill}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c("ar-void"), overflow: "hidden" }, plateStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, gridStyle]}>
            <Grid />
          </Animated.View>
          <Animated.View
            style={[
              { position: "absolute", left: "50%", top: "50%", width: 560, height: 560, marginLeft: -280, marginTop: -280, borderRadius: 280, backgroundColor: c("ar-green", 0.12), boxShadow: `0 0 120px 60px ${c("ar-green", 0.14)}` },
              glowStyle,
            ]}
          />

          {coins.map((coin) => (
            <FloatingCoin key={coin.id} {...coin} started={started} />
          ))}

          {phase === "ignite" && (
            <Animated.View style={[{ position: "absolute", left: 0, right: 0, height: 3 }, scanStyle]}>
              <LinearGradient
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                colors={[c("ar-green-hot", 0), c("ar-green-hot"), c("ar-green-hot", 0)]}
                style={{ flex: 1, boxShadow: `0 0 30px 6px ${c("ar-green", 0.75)}` }}
              />
            </Animated.View>
          )}

          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <BootMark started={started} />
            <Wordmark phase={phase} />
            <Tagline visible={phase === "boot" || opening} />

            <ChargeBar visible={phase === "boot"} lineIndex={lineIndex} perLine={perLine} typed={typed} />

            <SkipHint visible={phase === "boot"} />
          </View>

          <Animated.View
            pointerEvents="none"
            style={[
              { position: "absolute", left: "50%", top: "50%", width: 160, height: 160, marginLeft: -80, marginTop: -80, borderRadius: 80, borderWidth: 2, borderColor: c("ar-green-hot") },
              shockStyle,
            ]}
          />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function FloatingCoin({ left, top, size, delay, started }: { left: number; top: number; size: number; delay: number; started: boolean }) {
  const { c } = useColors();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!started) return;
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [started, delay, t]);
  const style = useAnimatedStyle(() => {
    // keyframes [0, .5, 1]: opacity 0→.75→.45, y 26→-14→6, rotate -30→18→-8
    const a = t.value < 0.5 ? t.value * 2 : (t.value - 0.5) * 2;
    const first = t.value < 0.5;
    const lerp = (x: number, y: number) => x + (y - x) * a;
    return {
      opacity: started ? (first ? lerp(0, 0.75) : lerp(0.75, 0.45)) : 0,
      transform: [
        { translateY: first ? lerp(26, -14) : lerp(-14, 6) },
        { rotate: `${first ? lerp(-30, 18) : lerp(18, -8)}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        { position: "absolute", left: `${left}%`, top: `${top}%`, width: size, height: size, borderRadius: size, borderWidth: 1, borderColor: c("ar-green", 0.4), overflow: "hidden" },
        style,
      ]}
    >
      <LinearGradient colors={[c("ar-green", 0.25), c("ar-green", 0)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

function BootMark({ started }: { started: boolean }) {
  const s = useSharedValue(0);
  const float = useSharedValue(0);
  useEffect(() => {
    if (!started) return;
    s.value = withSpring(1, { stiffness: 240, damping: 20, mass: 0.9 });
    float.value = withDelay(600, withRepeat(withSequence(withTiming(-6, { duration: 1600 }), withTiming(0, { duration: 1600 })), -1));
  }, [started, s, float]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, s.value * 1.4),
    transform: [{ translateY: float.value }, { scale: 2.2 - 1.2 * s.value }, { rotate: `${-16 + 16 * s.value}deg` }],
  }));
  return (
    <Animated.View style={[{ marginBottom: 8 }, style]}>
      <Image source={MARK} style={{ width: 88, height: 70 }} contentFit="contain" />
    </Animated.View>
  );
}

const GLYPH_FROM = [
  { y: -90, x: -40, r: -38 },
  { y: 70, x: 34, r: 30 },
  { y: -60, x: -22, r: -22 },
  { y: 84, x: 30, r: 34 },
  { y: -74, x: -30, r: -28 },
  { y: 62, x: 26, r: 20 },
];

function Glyph({ letter, i, go }: { letter: string; i: number; go: boolean }) {
  const { c } = useColors();
  const p = useSharedValue(0);
  useEffect(() => {
    if (go) p.value = withDelay(i * 55, withSpring(1, { stiffness: 260, damping: 20, mass: 0.85 }));
  }, [go, i, p]);
  const f = GLYPH_FROM[i]!;
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 1.3),
    transform: [
      { translateX: f.x * (1 - p.value) },
      { translateY: f.y * (1 - p.value) },
      { rotate: `${f.r * (1 - p.value)}deg` },
      { scale: 2.1 - 1.1 * p.value },
    ],
  }));
  return (
    <Animated.View style={style}>
      <Text className="font-hud font-bold" style={{ fontSize: 52, lineHeight: 56, letterSpacing: 2, color: c("ar-text") }}>
        {letter}
      </Text>
    </Animated.View>
  );
}

function Wordmark({ phase }: { phase: Phase }) {
  const { c } = useColors();
  const landed = phase !== "ignite" && phase !== "assemble";
  const showAr = phase === "stamp" || phase === "boot" || phase === "open";

  const ghost = useSharedValue(0);
  useEffect(() => {
    ghost.value = withSpring(phase === "ignite" ? 0 : landed ? 2 : 1, { stiffness: 180, damping: 18 });
  }, [phase, landed, ghost]);
  const ghostStyle = (dx: number) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => ({
      opacity: ghost.value <= 1 ? ghost.value * 0.85 : Math.max(0, 0.85 * (2 - ghost.value)),
      transform: [{ translateX: ghost.value <= 1 ? dx * 3 - dx * 2 * ghost.value : dx * (2 - ghost.value) }],
    }));
  const red = ghostStyle(-7);
  const cyan = ghostStyle(7);

  const stamp = useSharedValue(0);
  useEffect(() => {
    stamp.value = withSpring(showAr ? 1 : 0, { stiffness: 420, damping: 17, mass: 0.8 });
  }, [showAr, stamp]);
  const stampStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, stamp.value * 1.5),
    transform: [{ scale: 3.4 - 2.4 * stamp.value }, { rotate: `${-14 + 8 * stamp.value}deg` }],
  }));

  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      {(
        [
          ["hsl(358, 90%, 62%)", red],
          ["hsl(186, 95%, 60%)", cyan],
        ] as const
      ).map(([color, style]) => (
        <Animated.View key={color} pointerEvents="none" style={[{ position: "absolute" }, style]}>
          <Text className="font-hud font-bold" style={{ fontSize: 52, lineHeight: 56, letterSpacing: 2, color }}>
            WADZZO
          </Text>
        </Animated.View>
      ))}
      <View style={{ flexDirection: "row" }}>
        {WORDMARK.map((letter, i) => (
          <Glyph key={i} letter={letter} i={i} go={phase !== "ignite"} />
        ))}
        <Animated.View
          style={[
            {
              position: "absolute",
              right: -54,
              top: -6,
              height: 30,
              paddingHorizontal: 9,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: c("ar-green"),
              backgroundColor: c("ar-green", 0.14),
              justifyContent: "center",
              boxShadow: `0 0 22px -2px ${c("ar-green", 0.8)}, inset 0 0 14px -4px ${c("ar-green", 0.9)}`,
            },
            stampStyle,
          ]}
        >
          <Text className="font-hud font-bold" style={{ fontSize: 16, letterSpacing: 1.9, color: c("ar-green-hot") }}>
            AR
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

function FadeIn({ visible, children, delay = 0, duration = 450, y = 8 }: { visible: boolean; children: React.ReactNode; delay?: number; duration?: number; y?: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(visible ? delay : 0, withTiming(visible ? 1 : 0, { duration }));
  }, [visible, delay, duration, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: y * (1 - v.value) }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function Tagline({ visible }: { visible: boolean }) {
  return (
    <FadeIn visible={visible}>
      <Text className="mt-5 text-center text-[12.5px] leading-5 text-ar-dim">Collect the real world.</Text>
    </FadeIn>
  );
}

function ChargeBar({ visible, lineIndex, perLine, typed }: { visible: boolean; lineIndex: number; perLine: number; typed: string }) {
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: "13%", alignItems: "center", paddingHorizontal: 40 }}>
      <FadeIn visible={visible} duration={350} y={0}>
        <View style={{ alignItems: "center", gap: 12 }}>
          <View style={{ flexDirection: "row", width: 240, gap: 5 }}>
            {BOOT_LINES.map((_, i) => (
              <Segment key={i} filled={i <= lineIndex} duration={perLine} />
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text className="font-hud text-[10.5px] font-medium uppercase tracking-[2.4px] text-ar-faint" style={{ fontVariant: ["tabular-nums"] }}>
              {String(lineIndex + 1).padStart(2, "0")}
            </Text>
            <Text className="font-hud text-[10.5px] font-medium uppercase tracking-[2.4px] text-ar-green">{typed}</Text>
            <Caret />
          </View>
        </View>
      </FadeIn>
    </View>
  );
}

function Segment({ filled, duration }: { filled: boolean; duration: number }) {
  const { c } = useColors();
  const [w, setW] = useState(0);
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(filled ? 1 : 0, { duration, easing: Easing.linear });
  }, [filled, duration, p]);
  const style = useAnimatedStyle(() => ({ width: w * p.value }));
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flex: 1, height: 3, borderRadius: 2, overflow: "hidden", backgroundColor: c("ar-surface-3") }}>
      <Animated.View style={[{ height: 3, borderRadius: 2, backgroundColor: c("ar-green-hot"), boxShadow: `0 0 10px ${c("ar-green", 0.9)}` }, style]} />
    </View>
  );
}

function Caret() {
  const { c } = useColors();
  const v = useSharedValue(1);
  useEffect(() => {
    v.value = withRepeat(withSequence(withTiming(1, { duration: 500 }), withTiming(0, { duration: 0 }), withTiming(0, { duration: 500 }), withTiming(1, { duration: 0 })), -1);
  }, [v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View style={[{ width: 6, height: 10, backgroundColor: c("ar-green-hot") }, style]} />;
}

function SkipHint({ visible }: { visible: boolean }) {
  return (
    <View style={{ position: "absolute", bottom: "5%" }}>
      <FadeIn visible={visible} delay={400} duration={400} y={0}>
        <Text className="font-hud text-[9.5px] uppercase tracking-[2.9px] text-ar-faint" style={{ opacity: 0.75 }}>
          Tap to skip
        </Text>
      </FadeIn>
    </View>
  );
}

