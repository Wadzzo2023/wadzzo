import { Canvas, Circle, SweepGradient, vec } from "@shopify/react-native-skia";
import { Coins, PencilLine, Sparkles } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
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
import Svg, { Path } from "react-native-svg";

import { Confetti } from "~/components/fx/Confetti";
import { ArButton } from "~/components/ui/ArButton";
import { Text } from "~/components/ui/Text";
import type { ScanResult } from "~/lib/murals/constants";
import { useColors } from "~/theme/theme";

type Success = Exclude<ScanResult, { kind: "rejected" }>;

/**
 * ── MuralCelebration ───────────────────────────────────────────────────────
 *
 * Full screen, after a scan is accepted: the person's own photo of the wall
 * flies in and lands in a frame with a shockwave, gets stamped (Collected /
 * Discovered / Confirmed), coins burst out of it towards the top while the
 * total counts up, then it goes to the map, focused on that mural.
 *
 * The countdown bar shows when it will leave; a tap leaves now. The first
 * finders can still name the mural: "Name it" stops the countdown and
 * hands over to the naming sheet.
 */

/** How long it stays before going to the map. */
const HOLD_MS = { collected: 4_200, discovered: 5_600, canName: 8_000 };
const COIN_COUNT = 10;

function useCountUp(to: number, delay: number) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const t0 = setTimeout(() => {
      const start = Date.now();
      id = setInterval(() => {
        const t = Math.min(1, (Date.now() - start) / 1100);
        setV(Math.round(to * (1 - (1 - t) ** 3)));
        if (t >= 1) clearInterval(id);
      }, 30);
    }, delay);
    return () => {
      clearTimeout(t0);
      if (id) clearInterval(id);
    };
  }, [to, delay]);
  return v;
}

/** One coin flying out of the frame, up and away. */
function FlyingCoin({ index, gold, from }: { index: number; gold: string; from: { x: number; y: number } }) {
  const p = useSharedValue(0);
  // Fanned out across the top, a little different each.
  const spread = (index / (COIN_COUNT - 1) - 0.5) * 2;
  const dx = spread * 120 + (index % 2 ? 14 : -14);
  const dy = -230 - (index % 3) * 34;
  useEffect(() => {
    p.set(withDelay(900 + index * 70, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) })));
  }, [index, p]);
  const style = useAnimatedStyle(() => {
    const t = p.get();
    return {
      opacity: t === 0 ? 0 : t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1,
      transform: [{ translateX: dx * t }, { translateY: dy * t - 60 * Math.sin(Math.PI * t) }, { rotate: `${index * 40 + t * 280}deg` }, { scale: 0.6 + 0.6 * Math.sin(Math.PI * t) }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: from.x - 13, top: from.y - 13, width: 26, height: 26, borderRadius: 13, backgroundColor: gold, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFE7A3" }, style]}>
      <Coins size={13} strokeWidth={2.6} color="#5A3A00" />
    </Animated.View>
  );
}

const FRAME_CORNERS = ["M2 22V10a8 8 0 0 1 8-8h12", "M58 2h12a8 8 0 0 1 8 8v12", "M78 78v12a8 8 0 0 1-8 8H58", "M22 98H10a8 8 0 0 1-8-8V78"];

export function MuralCelebration({ result, photo, onDone, onName }: { result: Success; photo: string | null; onDone: () => void; onName: () => void }) {
  const { c } = useColors();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const discovered = result.kind === "discovered";
  const first = discovered && result.rank === 1;
  const canName = discovered && result.canName;
  const accent = discovered ? c("rarity-legendary") : c("rarity-epic");
  const gold = c("rarity-legendary");
  const total = result.coins + (discovered ? result.bonus : 0);
  const shown = useCountUp(total, reduced ? 0 : 900);
  const hold = canName ? HOLD_MS.canName : discovered ? HOLD_MS.discovered : HOLD_MS.collected;

  // ── Leave for the map (once) ──
  // `onDone` is read through a ref: the camera screen re-renders many times a
  // second, and a fresh callback each time must not restart the countdown.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  const left = useRef(false);
  const leave = () => {
    if (left.current) return;
    left.current = true;
    onDoneRef.current();
  };
  const [paused, setPaused] = useState(false);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (paused) return;
    const fire = setTimeout(() => setBurst((n) => n + 1), reduced ? 0 : 640);
    const exit = setTimeout(() => {
      if (left.current) return;
      left.current = true;
      onDoneRef.current();
    }, hold);
    return () => {
      clearTimeout(fire);
      clearTimeout(exit);
    };
  }, [paused, hold, reduced]);

  // ── Motion ──
  const rise = useSharedValue(reduced ? 1 : 0);
  const float = useSharedValue(0);
  const rays = useSharedValue(0);
  const shock = useSharedValue(0);
  const stamp = useSharedValue(reduced ? 1 : 0);
  const countdown = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    rise.set(withSpring(1, { stiffness: 140, damping: 15, mass: 1.1 }));
    float.set(withDelay(900, withRepeat(withSequence(withTiming(-8, { duration: 1700, easing: Easing.inOut(Easing.ease) }), withTiming(0, { duration: 1700, easing: Easing.inOut(Easing.ease) })), -1)));
    rays.set(withRepeat(withTiming(1, { duration: 24_000, easing: Easing.linear }), -1));
    shock.set(withDelay(560, withTiming(1, { duration: 1000, easing: Easing.out(Easing.ease) })));
    stamp.set(withDelay(640, withSpring(1, { stiffness: 460, damping: 15 })));
  }, [reduced, rise, float, rays, shock, stamp]);
  useEffect(() => {
    countdown.set(paused ? countdown.get() : withTiming(1, { duration: hold, easing: Easing.linear }));
  }, [paused, hold, countdown]);

  const frameStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, rise.get() * 4),
    transform: [
      { perspective: 1400 },
      { translateY: 380 * (1 - rise.get()) + float.get() },
      { rotateY: `${200 * (1 - rise.get())}deg` },
      { rotateZ: `${-3 - 16 * (1 - rise.get())}deg` },
      { scale: 0.65 + 0.35 * rise.get() },
    ],
  }));
  const raysStyle = useAnimatedStyle(() => ({ opacity: 0.5 * Math.min(1, rise.get()), transform: [{ rotate: `${rays.get() * 360}deg` }, { scale: 0.6 + 0.4 * Math.min(1, rise.get()) }] }));
  const shockStyle = useAnimatedStyle(() => {
    const s = shock.get();
    return { opacity: s === 0 ? 0 : s < 0.2 ? s * 4.25 : 0.85 * (1 - s), transform: [{ scale: 0.3 + 3.2 * s }] };
  });
  const stampStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, stamp.get() * 1.5), transform: [{ scale: 2.6 - 1.6 * stamp.get() }, { rotate: `${-14 + 10 * stamp.get()}deg` }] }));
  const barStyle = useAnimatedStyle(() => ({ width: `${countdown.get() * 100}%` }));

  // Purple (or gold) rays: six soft beams.
  const R = 400;
  const stops: string[] = [];
  const positions: number[] = [];
  for (let i = 0; i < 6; i++) {
    const base = i * 60;
    stops.push(c(discovered ? "rarity-legendary" : "rarity-epic", 0), c(discovered ? "rarity-legendary" : "rarity-epic", 0.55), c(discovered ? "rarity-legendary" : "rarity-epic", 0));
    positions.push(base / 360, (base + 12) / 360, (base + 26) / 360);
  }

  const frameW = Math.min(220, width * 0.56);
  const frameH = frameW * 1.25;
  const stampText = discovered ? (first ? "Discovered" : "Confirmed") : "Collected";
  const headline = discovered ? (first ? "You found a new mural!" : `Finder #${result.rank} — thanks for confirming!`) : "Mural collected";

  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(220)} style={[StyleSheet.absoluteFill, { zIndex: 80 }]}>
      <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Continue to the map" style={[StyleSheet.absoluteFill, { backgroundColor: c("ar-void", 0.94), alignItems: "center", justifyContent: "center", paddingHorizontal: 32, overflow: "hidden" }]}>
        <Animated.View pointerEvents="none" style={[{ position: "absolute", width: R * 2, height: R * 2 }, raysStyle]}>
          <Canvas style={{ flex: 1 }}>
            <Circle cx={R} cy={R} r={R}>
              <SweepGradient c={vec(R, R)} colors={[...stops, stops[0]!]} positions={[...positions, 1]} />
            </Circle>
          </Canvas>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[{ position: "absolute", width: 200, height: 200, borderRadius: 100, borderWidth: 2, borderColor: accent }, shockStyle]} />

        {/* The photo, framed like a found piece of street art. */}
        <View style={{ width: frameW, height: frameH }}>
          {!reduced && Array.from({ length: COIN_COUNT }, (_, i) => <FlyingCoin key={i} index={i} gold={gold} from={{ x: frameW / 2, y: frameH / 2 }} />)}
          <Animated.View style={[{ width: frameW, height: frameH, borderRadius: 18, padding: 6, backgroundColor: c("ar-surface"), borderWidth: 2, borderColor: accent, boxShadow: `0 0 40px -6px ${accent}` }, frameStyle]}>
            <View style={{ flex: 1, borderRadius: 12, overflow: "hidden", backgroundColor: c("ar-surface-2") }}>
              {photo ? <Image source={{ uri: photo }} style={{ flex: 1 }} resizeMode="cover" /> : null}
            </View>
            {/* Viewfinder corners, the scan's own mark. */}
            <Svg width={frameW} height={frameH} viewBox="0 0 80 100" preserveAspectRatio="none" style={{ position: "absolute", left: 0, top: 0 }}>
              {FRAME_CORNERS.map((d) => (
                <Path key={d} d={d} stroke="#fff" strokeWidth={1.6} strokeLinecap="round" fill="none" opacity={0.9} />
              ))}
            </Svg>
            {/* The stamp, slammed onto the corner. */}
            <Animated.View style={[{ position: "absolute", bottom: -14, alignSelf: "center", borderRadius: 9, borderWidth: 2, paddingHorizontal: 14, paddingVertical: 4, borderColor: accent, backgroundColor: c("ar-void", 0.92), boxShadow: `0 0 22px -4px ${accent}` }, stampStyle]}>
              <Text className="font-hud text-[13px] font-bold uppercase tracking-[3.6px]" style={{ color: accent }}>
                {stampText}
              </Text>
            </Animated.View>
          </Animated.View>
        </View>

        <Animated.View entering={reduced ? undefined : FadeInDown.delay(760).duration(360)} style={{ marginTop: 34, alignItems: "center" }}>
          {discovered && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 }}>
              <Sparkles size={13} strokeWidth={2.6} color={gold} />
              <Text className="font-hud text-[10px] font-bold uppercase tracking-[2px]" style={{ color: gold }}>
                {first ? "Discoverer" : `Finder #${result.rank}`}
              </Text>
            </View>
          )}
          <Text className="font-hud max-w-[18rem] text-center text-[20px] font-bold leading-6 text-ar-text">{headline}</Text>
          <Text className="mt-1 max-w-[18rem] text-center text-[12.5px] text-ar-dim" numberOfLines={2}>
            {result.mural.title}
          </Text>

          {/* Coins, counting up as they fly. */}
          <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, borderWidth: 1, borderColor: c("rarity-legendary", 0.45), backgroundColor: c("rarity-legendary", 0.12), paddingHorizontal: 16, paddingVertical: 8 }}>
            <Coins size={20} strokeWidth={2.4} color={gold} />
            <Text className="font-hud text-[24px] font-bold" style={{ color: gold }}>
              +{shown}
            </Text>
            <Text className="font-hud text-[10px] font-bold uppercase tracking-[1.4px] text-ar-dim">Wadzzo Coins</Text>
          </View>
          {discovered && result.bonus > 0 && (
            <Text className="mt-1.5 text-[11px] text-ar-dim">
              {result.coins} for the scan · <Text style={{ color: gold, fontWeight: "600" }}>+{result.bonus} discovery bonus</Text>
            </Text>
          )}
          <Text className="mt-1 text-[10px] uppercase tracking-[1.4px] text-ar-faint">
            Balance {result.balance.toLocaleString()} · scans today {result.scansToday}/{result.dailyLimit}
          </Text>

          {canName && !paused && (
            <View style={{ marginTop: 16 }}>
              <ArButton
                variant="primary"
                size="md"
                icon={PencilLine}
                onPress={() => {
                  setPaused(true);
                  onName();
                }}
              >
                Name this mural
              </ArButton>
            </View>
          )}
        </Animated.View>

        {/* When it leaves for the map. */}
        {!paused && (
          <Animated.View entering={FadeIn.delay(1200).duration(400)} style={{ position: "absolute", bottom: "6%", left: 48, right: 48, alignItems: "center" }}>
            <View style={{ alignSelf: "stretch", height: 3, borderRadius: 2, backgroundColor: c("ar-text", 0.12), overflow: "hidden" }}>
              <Animated.View style={[{ height: 3, borderRadius: 2, backgroundColor: accent }, barStyle]} />
            </View>
            <Text className="font-hud mt-2 text-[9.5px] uppercase tracking-[2.6px] text-ar-faint">Opening the map · tap to go now</Text>
          </Animated.View>
        )}
      </Pressable>
      <Confetti trigger={burst} rarity={discovered ? "legendary" : "epic"} origin={{ x: 0.5, y: 0.4 }} count={discovered ? 150 : 100} />
    </Animated.View>
  );
}
