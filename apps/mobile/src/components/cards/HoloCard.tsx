import { DeviceMotion } from "expo-sensors";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import {
  BadgeCheck,
  Camera,
  Check,
  Lock,
  QrCode,
  RefreshCw,
  Satellite,
  Sparkles,
  TimerOff,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  cancelAnimation,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle as SvgCircle, Defs, Pattern, RadialGradient as SvgRadial, Rect, Stop } from "react-native-svg";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { Text } from "~/components/ui/Text";
import { AR_CAPTURE_RADIUS } from "~/lib/ar/geo";
import { pinStatus, RARITY_META } from "~/lib/ar/rarity";
import type { ArBrand, ArPin, DetectionMethod, Rarity } from "~/lib/ar/types";
import { useDecorativeMotion } from "~/lib/motion";
import { useColors } from "~/theme/theme";

const MARK = require("../../../assets/brand/wadzzo-mark.png");
/** Gyroscope: sample rate while moving, stillness threshold, idle poll. */
const FAST_MS = 33;
const IDLE_MS = 2_000;
const IDLE_POLL_MS = 250;
const DEADBAND = 0.01;
/** Card flip. The web's 650ms felt slow on a phone. */
const FLIP_MS = 460;
const R_OUTER = 14;
const R_INNER = 12.5;

/** The web frame colours per rarity (`getFrameBorderClasses`). */
const FRAME: Record<Rarity, { border: string; glow: string }> = {
  common: { border: "#25322b", glow: "rgba(0,0,0,0.6)" },
  rare: { border: "#1a4a63", glow: "rgba(14,165,233,0.35)" },
  epic: { border: "#5b2478", glow: "rgba(168,85,247,0.4)" },
  legendary: { border: "#967018", glow: "rgba(245,158,11,0.5)" },
  mythic: { border: "#96236b", glow: "rgba(236,72,153,0.6)" },
};

const detectionIcon = (m: DetectionMethod): LucideIcon => (m === "qr" ? QrCode : m === "image" ? Camera : Satellite);

/**
 * Theme colours come as `rgb(r, g, b)`; the web appended hex alpha to hex
 * colours (`accent + "99"`), which on `rgb()` yields an invalid colour that
 * iOS paints solid grey over the icon. Convert properly instead.
 */
const withAlpha = (color: string, alpha: number) => {
  const m = color.match(/rgba?\(([^,]+),([^,]+),([^,)]+)/);
  return m ? `rgba(${m[1]!.trim()}, ${m[2]!.trim()}, ${m[3]!.trim()}, ${alpha})` : color;
};

const compact = (n: number) => (n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

/**
 * ── HoloCard ───────────────────────────────────────────────────────────────
 *
 * Port of wadzzoAR's trading card: same faces (drop front, creator front,
 * Wadzzo back), same frame colours, same `cqw`-proportional type (every size
 * here is a percentage of the card's own width, like the web's container
 * units), and the same three foil layers — rainbow color-dodge, sparkle,
 * overlay glare — composited with native `mixBlendMode`.
 *
 * The web drives the foil from the pointer; here `interactive` cards follow
 * the phone's tilt (gyroscope — an approved native addition) and a finger
 * drag.
 *
 * GPU budget: a screen shows many grid cards, so non-interactive cards are
 * "lite" — no foil (three blend-mode layers) and crisp borders instead of
 * blurred glows and shadows, each of which is an offscreen pass per card.
 * The interactive card keeps the full look, but its gyroscope idles once the
 * phone is still and stops entirely while `motionPaused` (scrolled away,
 * screen not focused), so a resting card costs ~nothing to draw.
 */
export function HoloCard({
  pin,
  brand,
  creatorBack = false,
  interactive = false,
  oneFace = false,
  showFlipButton = false,
  motionPaused = false,
  onPress,
  style,
}: {
  pin: ArPin;
  brand?: ArBrand | null;
  creatorBack?: boolean;
  interactive?: boolean;
  oneFace?: boolean;
  showFlipButton?: boolean;
  /** Stop following the gyroscope (card scrolled off-screen, page not focused). */
  motionPaused?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { rarity: rc } = useColors();
  const reduced = useReducedMotion();
  // Low Power Mode / backgrounded / screen hidden also stop the gyroscope.
  const motionOk = useDecorativeMotion();
  const [w, setW] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const status = pinStatus(pin);
  const spent = status === "expired" || (pin.collected && pin.isRedeemed === true);

  // Tilt in [-1, 1] on each axis; drives rotation and every foil layer.
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const active = useSharedValue(0);
  const maxTilt = interactive ? 16 : 8;

  useEffect(() => {
    if (!interactive || reduced || motionPaused || !motionOk) return;
    // Sample fast while the phone moves; after IDLE_MS of stillness drop to a
    // slow check and stop writing to the animation, so nothing redraws.
    let fast = true;
    let lastX = 2;
    let lastY = 2;
    let stillSince = Date.now();
    DeviceMotion.setUpdateInterval(FAST_MS);
    const sub = DeviceMotion.addListener((m) => {
      const r = m.rotation;
      if (!r) return;
      // gamma: left/right, beta: front/back (radians). ±0.5 rad ≈ full tilt.
      const x = Math.max(-1, Math.min(1, r.gamma / 0.5));
      const y = Math.max(-1, Math.min(1, (r.beta - 0.9) / 0.5));
      const moved = Math.abs(x - lastX) > DEADBAND || Math.abs(y - lastY) > DEADBAND;
      const now = Date.now();
      if (!moved) {
        if (fast && now - stillSince > IDLE_MS) {
          fast = false;
          DeviceMotion.setUpdateInterval(IDLE_POLL_MS);
          // Settle flat: iOS draws a 3D-rotated layer as a resampled
          // texture, so text on a card left tilted looks soft.
          tx.value = withSpring(0, { damping: 20, stiffness: 90 });
          ty.value = withSpring(0, { damping: 20, stiffness: 90 });
          active.value = withTiming(0, { duration: 600 });
        }
        return;
      }
      stillSince = now;
      lastX = x;
      lastY = y;
      if (!fast) {
        fast = true;
        DeviceMotion.setUpdateInterval(FAST_MS);
      }
      tx.value = withSpring(x, { damping: 18, stiffness: 120 });
      ty.value = withSpring(y, { damping: 18, stiffness: 120 });
      active.value = withTiming(1, { duration: 300 });
    });
    return () => sub.remove();
  }, [interactive, reduced, motionPaused, motionOk, tx, ty, active]);

  const pan = Gesture.Pan()
    .enabled(interactive)
    .onUpdate((e) => {
      if (!w) return;
      tx.value = Math.max(-1, Math.min(1, e.x / w * 2 - 1));
      ty.value = Math.max(-1, Math.min(1, e.y / (w * 1.4) * 2 - 1));
      active.value = 1;
    })
    .onEnd(() => {
      tx.value = withSpring(0);
      ty.value = withSpring(0);
    });

  // At rest every 3D transform must be *no* transform. A perspective matrix
  // (or a rotateY(360deg), which isn't exactly identity in floating point)
  // makes iOS draw the layer as a resampled texture — soft text. So each
  // style drops to [] whenever it's flat.
  const tilt = useAnimatedStyle(() => {
    if (Math.abs(tx.value) < 0.002 && Math.abs(ty.value) < 0.002) return { transform: [] };
    return { transform: [{ perspective: 1200 }, { rotateX: `${-ty.value * maxTilt}deg` }, { rotateY: `${tx.value * maxTilt}deg` }] };
  });

  const flip = useSharedValue(0);
  const toggleFlip = () => {
    // Start the turn on the UI thread straight from the tap, not after a
    // React re-render of the whole card.
    const next = !flipped;
    flip.value = withTiming(next ? 180 : 0, { duration: FLIP_MS, easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
    setFlipped(next);
  };
  const frontStyle = useAnimatedStyle(() => {
    const a = flip.value;
    return a < 0.01 ? { transform: [] } : { transform: [{ perspective: 1200 }, { rotateY: `${a}deg` }] };
  });
  const backStyle = useAnimatedStyle(() => {
    const a = (flip.value + 180) % 360; // 0 when the back faces you
    return a < 0.01 || a > 359.99 ? { transform: [] } : { transform: [{ perspective: 1200 }, { rotateY: `${a}deg` }] };
  });

  const meta = RARITY_META[pin.rarity];
  const glowColor = rc(pin.rarity, 0.6);
  const lite = !interactive;

  const card = (
    <Animated.View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        {
          aspectRatio: 5 / 7,
          width: "100%",
          borderRadius: R_OUTER,
          borderWidth: 1.5,
          borderColor: spent ? (lite ? "rgba(0,0,0,0.5)" : "transparent") : rc(pin.rarity, lite ? 0.6 : 0.45),
          // Lite cards: the rarity border above is the glow.
          boxShadow: lite ? undefined : spent ? "0 8px 24px -12px rgba(0,0,0,0.9)" : `0 10px 30px -10px ${glowColor}, 0 20px 45px -20px rgba(0,0,0,0.95)`,
        },
        tilt,
        style,
      ]}
    >
      {w > 0 && (
        <>
          {!oneFace && (
            <Animated.View style={[StyleSheet.absoluteFill, { backfaceVisibility: "hidden", borderRadius: R_INNER, overflow: "hidden" }, backStyle]}>
              {creatorBack ? <CreatorFront pin={pin} brand={brand} w={w} /> : <CardBack w={w} spinning={flipped} />}
            </Animated.View>
          )}
          <Animated.View style={[StyleSheet.absoluteFill, { backfaceVisibility: "hidden", borderRadius: R_INNER, overflow: "hidden" }, !oneFace && frontStyle]}>
            <DropFront pin={pin} w={w} spent={spent} status={status} interactive={interactive} lite={lite} tx={tx} ty={ty} active={active} />
          </Animated.View>
        </>
      )}
    </Animated.View>
  );

  return (
    <View>
      <GestureDetector gesture={pan}>
        {onPress ? (
          <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${pin.title}, ${meta.label}`}>
            {card}
          </Pressable>
        ) : (
          card
        )}
      </GestureDetector>
      {!oneFace && showFlipButton && (
        <Pressable
          onPress={toggleFlip}
          accessibilityRole="button"
          className="mt-3 flex-row items-center gap-1.5 self-center rounded-full border border-ar-line bg-ar-surface px-3 py-1.5"
        >
          <RefreshCw size={12} strokeWidth={2.4} color={rc(pin.rarity)} />
          <Text className="font-hud text-[10px] font-semibold uppercase tracking-[1.4px] text-ar-dim">{flipped ? "Front" : creatorBack ? "Creator" : "Back"}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Faces ─────────────────────────────────────────────────────────────────

function Face({ w, border, glow, accent, lite = false, children }: { w: number; border: string; glow: string; accent: string; lite?: boolean; children: ReactNode }) {
  const { c } = useColors();
  return (
    <View style={{ flex: 1, borderWidth: 5, borderColor: border, borderRadius: R_INNER, overflow: "hidden", boxShadow: lite ? undefined : `0 0 12px ${glow}` }}>
      <LinearGradient colors={[accent, c("ar-surface-2"), c("ar-void")]} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, width: w - 13 }}>{children}</View>
    </View>
  );
}

const cq = (w: number, pct: number) => (w * pct) / 100;

function TcgName({ w, eyebrow, title, accent, icon: Icon }: { w: number; eyebrow: string; title: string; accent: string; icon: LucideIcon }) {
  const { c } = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: cq(w, 2), paddingTop: cq(w, 3.4), paddingHorizontal: cq(w, 3.6), paddingBottom: cq(w, 1.6) }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text className="font-hud font-semibold uppercase" style={{ fontSize: cq(w, 2.2), letterSpacing: cq(w, 2.2) * 0.22, color: c("ar-text-faint") }}>
          {eyebrow}
        </Text>
        <Text numberOfLines={1} className="font-hud font-bold" style={{ marginTop: cq(w, 0.4), fontSize: cq(w, 5.4), lineHeight: cq(w, 5.4) * 1.15, color: c("ar-text") }}>
          {title}
        </Text>
      </View>
      <View style={{ width: cq(w, 8), height: cq(w, 8), borderRadius: cq(w, 4), borderWidth: Math.max(1, cq(w, 0.3)), alignItems: "center", justifyContent: "center", borderColor: withAlpha(accent, 0.6), backgroundColor: withAlpha(accent, 0.18) }}>
        <Icon size={cq(w, 4.4)} strokeWidth={2.6} color={accent} />
      </View>
    </View>
  );
}

function Chip({ w, bg, fg, end, lite = false, children }: { w: number; bg: string; fg: string; end?: boolean; lite?: boolean; children: ReactNode }) {
  const { c } = useColors();
  return (
    <View
      style={{
        position: "absolute",
        bottom: -cq(w, 2.4),
        ...(end ? { right: cq(w, 2.6) } : { left: cq(w, 2.6) }),
        maxWidth: "46%",
        height: cq(w, 6.4),
        paddingHorizontal: cq(w, 2),
        borderRadius: 999,
        borderWidth: Math.max(1, cq(w, 0.35)),
        borderColor: c("ar-void"),
        backgroundColor: bg,
        flexDirection: "row",
        alignItems: "center",
        gap: cq(w, 1),
        zIndex: 10,
        boxShadow: lite ? undefined : "0 2px 6px rgba(0,0,0,0.6)",
      }}
    >
      {typeof children === "string" ? (
        <Text numberOfLines={1} className="font-hud font-bold uppercase" style={{ fontSize: cq(w, 2.6), letterSpacing: cq(w, 0.26), color: fg }}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

function Footer({ w, left, center, right }: { w: number; left: ReactNode; center: ReactNode; right: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingVertical: cq(w, 1.8), paddingHorizontal: cq(w, 3.6), borderTopWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(0,0,0,0.35)", gap: cq(w, 1) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: cq(w, 0.9), flexShrink: 1 }}>{left}</View>
      <View style={{ flexShrink: 1 }}>{center}</View>
      <View style={{ flexShrink: 1, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

function FooterText({ w, color, children, bold = true, upper = true }: { w: number; color: string; children: ReactNode; bold?: boolean; upper?: boolean }) {
  return (
    <Text numberOfLines={1} className={bold ? "font-hud font-bold" : "font-hud font-semibold"} style={{ fontSize: cq(w, 2.3), letterSpacing: cq(w, 0.28), color, textTransform: upper ? "uppercase" : "none", fontVariant: ["tabular-nums"] }}>
      {children}
    </Text>
  );
}

function DropFront({ pin, w, spent, status, interactive, lite, tx, ty, active }: { pin: ArPin; w: number; spent: boolean; status: string; interactive: boolean; lite: boolean; tx: SharedValue<number>; ty: SharedValue<number>; active: SharedValue<number> }) {
  const { c, rarity: rc } = useColors();
  const [failed, setFailed] = useState(false);
  const meta = RARITY_META[pin.rarity];
  const accent = rc(pin.rarity);
  const Det = detectionIcon(pin.detection);
  const serial = pin.supply != null ? (Array.from(pin.id).reduce((a, ch) => a + ch.charCodeAt(0), 0) % pin.supply) + 1 : null;
  const serialLabel = `№ ${serial ? String(serial).padStart(3, "0") : "001"}/${pin.supply ?? "∞"}`;
  const foot =
    status === "locked"
      ? { Icon: Lock, label: "Locked", color: c("ar-text-faint") }
      : status === "expired"
        ? { Icon: TimerOff, label: "Expired", color: c("ar-danger") }
        : pin.collected
          ? { Icon: Check, label: "Collected", color: c("ar-green-hot") }
          : { Icon: Sparkles, label: "Available", color: c("ar-text-dim") };
  const frame = FRAME[pin.rarity];

  return (
    <Face w={w} border={frame.border} glow={frame.glow} accent={rc(pin.rarity, 0.22)} lite={lite}>
      <TcgName w={w} eyebrow={pin.autoCollect ? "Auto AR Drop" : "Basic AR Drop"} title={pin.title} accent={accent} icon={Det} />
      <View style={{ marginHorizontal: cq(w, 3.6) }}>
        <View
          style={{
            aspectRatio: interactive ? 16 / 11 : 5 / 4,
            borderRadius: Math.max(10, cq(w, 5.2)),
            borderWidth: Math.max(1, cq(w, 0.5)),
            borderColor: "rgba(255,255,255,0.16)",
            backgroundColor: "#000",
            overflow: "hidden",
            boxShadow: lite ? undefined : "inset 0 0 10px rgba(0,0,0,0.85)",
          }}
        >
          {failed ? (
            <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: rc(pin.rarity, 0.2) }]}>
              <Text className="font-hud font-bold" style={{ fontSize: 56, opacity: 0.35, color: accent }}>
                {pin.title.trim().charAt(0).toUpperCase()}
              </Text>
            </View>
          ) : (
            <Image source={{ uri: pin.imageUrl }} onError={() => setFailed(true)} style={[StyleSheet.absoluteFill, spent && { opacity: 0.55 }]} contentFit="cover" transition={200} />
          )}
          {(pin.collected || status === "expired" || status === "locked") && (
            <View style={{ position: "absolute", right: cq(w, 2.4), top: cq(w, 2.4), zIndex: 10 }}>
              <StateStamp kind={status === "locked" ? "locked" : status === "expired" ? "expired" : "collected"} />
            </View>
          )}
          {/* Foil only where it can move — grid cards skip its blend layers. */}
          {!spent && !lite && <Foil tx={tx} ty={ty} active={active} w={w} />}
        </View>
        <Chip w={w} bg={accent} fg={c("ar-void")} lite={lite}>
          {`${meta.short} ${meta.label}`}
        </Chip>
        <Chip w={w} bg={c("ar-void")} fg={accent} end lite={lite}>
          <Det size={cq(w, 3.4)} strokeWidth={2.8} color={accent} />
          <Text numberOfLines={1} className="font-hud font-bold uppercase" style={{ fontSize: cq(w, 2.6), color: accent }}>
            {pin.autoCollect ? "Auto" : `${AR_CAPTURE_RADIUS}m`}
          </Text>
        </Chip>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: cq(w, 1.4), marginTop: cq(w, 4.6), marginHorizontal: cq(w, 3.6), paddingBottom: cq(w, 1.6), borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
        <BrandAvatar src={pin.brandImageUrl} style={{ width: cq(w, 4.4), height: cq(w, 4.4), borderRadius: cq(w, 2.2) }} />
        <Text numberOfLines={1} className="font-hud font-semibold uppercase" style={{ fontSize: cq(w, 2.7), letterSpacing: cq(w, 0.32), color: c("ar-text") }}>
          {pin.brandName}
        </Text>
      </View>
      <Text numberOfLines={3} style={{ marginHorizontal: cq(w, 3.6), paddingVertical: cq(w, 2), fontSize: cq(w, 2.8), lineHeight: cq(w, 4.2), color: c("ar-text-dim") }}>
        {pin.description}
      </Text>
      <Footer
        w={w}
        left={
          <>
            <View style={{ width: cq(w, 5.6), height: cq(w, 5.6), borderRadius: cq(w, 2.8), alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(foot.color, 0.22) }}>
              <foot.Icon size={cq(w, 3.6)} strokeWidth={2.8} color={foot.color} />
            </View>
            <FooterText w={w} color={c("ar-text")}>{foot.label}</FooterText>
          </>
        }
        center={<FooterText w={w} color={c("ar-text-dim")} bold={false} upper={false}>{serialLabel}</FooterText>}
        right={
          pin.redeemCode ? (
            <FooterText w={w} color={c("ar-green-hot")}>{`Code ${pin.redeemCode}`}</FooterText>
          ) : pin.locked && pin.lockReason ? (
            <FooterText w={w} color={c("ar-text-faint")} bold={false} upper={false}>{pin.lockReason}</FooterText>
          ) : (
            <FooterText w={w} color={c("ar-text-faint")}>Wadzzo • AR</FooterText>
          )
        }
      />
    </Face>
  );
}

function CreatorFront({ pin, brand, w }: { pin: ArPin; brand?: ArBrand | null; w: number }) {
  const { c } = useColors();
  const accent = c("ar-green");
  const name = brand?.name ?? pin.brandName;
  const handle = brand?.handle ? `@${brand.handle}` : "@creator";
  const origin = brand?.categories?.slice(0, 2).join(" • ") || brand?.region || "Stellar creator";
  const bio = brand?.bio || brand?.tagline || "Official Wadzzo creator placing drops in the real world.";
  const drops = brand?.pinCount ?? 1;
  const verified = brand?.verified ?? false;
  const Icon = verified ? BadgeCheck : Users;
  return (
    <Face w={w} border="#134226" glow="rgba(34,197,94,0.35)" accent={c("ar-green", 0.24)}>
      <TcgName w={w} eyebrow="Trainer • Creator" title={name} accent={accent} icon={Icon} />
      <View style={{ marginHorizontal: cq(w, 3.6) }}>
        <View style={{ aspectRatio: 5 / 4, borderRadius: Math.max(10, cq(w, 5.2)), borderWidth: Math.max(1, cq(w, 0.5)), borderColor: "rgba(255,255,255,0.16)", backgroundColor: "#000", overflow: "hidden" }}>
          <BrandAvatar src={brand?.avatarUrl ?? pin.brandImageUrl} style={StyleSheet.absoluteFill} />
        </View>
        <Chip w={w} bg={verified ? accent : c("ar-void")} fg={verified ? c("ar-void") : c("ar-text-faint")}>
          <Icon size={cq(w, 3.4)} strokeWidth={2.8} color={verified ? c("ar-void") : c("ar-text-faint")} />
          <Text className="font-hud font-bold uppercase" style={{ fontSize: cq(w, 2.6), color: verified ? c("ar-void") : c("ar-text-faint") }}>
            {verified ? "Verified" : "Creator"}
          </Text>
        </Chip>
        <Chip w={w} bg={c("ar-void")} fg={accent} end>
          {origin}
        </Chip>
      </View>
      <View style={{ marginTop: cq(w, 4.6), marginHorizontal: cq(w, 3.6), paddingBottom: cq(w, 1.6), borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
        <Text numberOfLines={1} className="font-hud font-semibold uppercase" style={{ fontSize: cq(w, 2.7), letterSpacing: cq(w, 0.32), color: c("ar-text") }}>
          {handle}
        </Text>
      </View>
      <Text numberOfLines={3} style={{ marginHorizontal: cq(w, 3.6), paddingVertical: cq(w, 2), fontSize: cq(w, 2.8), lineHeight: cq(w, 4.2), color: c("ar-text-dim") }}>
        {bio}
      </Text>
      <Footer
        w={w}
        left={
          <>
            <View style={{ width: cq(w, 5.6), height: cq(w, 5.6), borderRadius: cq(w, 2.8), alignItems: "center", justifyContent: "center", backgroundColor: c("ar-green", 0.22) }}>
              <Sparkles size={cq(w, 3.6)} strokeWidth={2.8} color={accent} />
            </View>
            <FooterText w={w} color={c("ar-text")}>{`${drops} ${drops === 1 ? "drop" : "drops"}`}</FooterText>
          </>
        }
        center={<FooterText w={w} color={c("ar-text-dim")} bold={false} upper={false}>{`${compact(brand?.followers ?? 0)} followers`}</FooterText>}
        right={<FooterText w={w} color={c("ar-text-faint")}>Wadzzo • AR</FooterText>}
      />
    </Face>
  );
}

/** Port of `WadzzoCardBack` — the seal, also used as the loading face. */
export function CardBack({ w, loading = false, spinning = true }: { w: number; loading?: boolean; spinning?: boolean }) {
  const { c } = useColors();
  const live = useDecorativeMotion();
  const spin = useSharedValue(0);
  useEffect(() => {
    // Only while the back is actually showing: a hidden face still redraws.
    if (!spinning || !live) return;
    spin.value = withRepeat(withTiming(spin.value + 360, { duration: 28_000, easing: Easing.linear }), -1);
    return () => cancelAnimation(spin);
  }, [spin, spinning, live]);
  const dashed = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const pip = { position: "absolute" as const, width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: c("ar-green"), backgroundColor: c("ar-green-hot"), boxShadow: `0 0 8px ${c("ar-green")}` };
  return (
    <View style={{ flex: 1, borderWidth: 6, borderColor: "#0c1f14", backgroundColor: "#05110a", borderRadius: R_INNER, overflow: "hidden" }}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgRadial id="back" cx="50%" cy="50%" r="72%">
            <Stop offset="0" stopColor={c("ar-green")} stopOpacity={0.28} />
            <Stop offset="1" stopColor={c("ar-void")} stopOpacity={1} />
          </SvgRadial>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#back)" opacity={0.85} />
      </Svg>
      <View style={{ position: "absolute", inset: 8, borderRadius: 9, borderWidth: 1, borderColor: c("ar-green", 0.35) }} />
      <View style={{ position: "absolute", inset: 12, borderRadius: 7, borderWidth: 1, borderColor: c("ar-green", 0.15) }} />
      <View style={[pip, { left: 14, top: 14 }]} />
      <View style={[pip, { right: 14, top: 14 }]} />
      <View style={[pip, { left: 14, bottom: 14 }]} />
      <View style={[pip, { right: 14, bottom: 14 }]} />
      <View style={{ position: "absolute", top: 16, left: 0, right: 0, alignItems: "center" }}>
        <Text className="font-hud font-bold uppercase" style={{ fontSize: Math.max(9, cq(w, 4.2)), letterSpacing: 4, color: c("ar-green-hot") }}>
          W A D Z Z O
        </Text>
      </View>
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        <View style={{ width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: c("ar-green", 0.5), alignItems: "center", justifyContent: "center", backgroundColor: c("ar-surface"), boxShadow: `0 0 24px ${c("ar-green", 0.4)}, inset 0 0 16px rgba(0,0,0,0.85)` }}>
          <Animated.View style={[{ position: "absolute", inset: 4, borderRadius: 50, borderWidth: 1, borderStyle: "dashed", borderColor: c("ar-green", 0.35) }, dashed]} />
          <Image source={MARK} style={{ width: 56, height: 56, opacity: loading ? 0.7 : 1 }} contentFit="contain" />
        </View>
      </View>
      <View style={{ position: "absolute", bottom: 16, left: 12, right: 12, alignItems: "center" }}>
        <Text className="font-hud font-semibold uppercase" style={{ fontSize: 8, letterSpacing: 2.1, color: c("ar-text-dim") }}>
          {loading ? "INITIALIZING HOLOGRAM…" : "AR COLLECTIBLE"}
        </Text>
        <Text className="font-hud mt-0.5 uppercase" style={{ fontSize: 7, letterSpacing: 1.1, color: c("ar-text-faint") }}>
          STELLAR • SOROBAN VERIFIED
        </Text>
      </View>
    </View>
  );
}

function StateStamp({ kind }: { kind: "collected" | "expired" | "locked" }) {
  const { c } = useColors();
  const map = {
    collected: { Icon: Check, border: c("rarity-legendary", 0.7), bg: c("rarity-legendary", 0.2), fg: c("rarity-legendary") },
    expired: { Icon: TimerOff, border: c("ar-danger", 0.6), bg: c("ar-danger", 0.2), fg: c("ar-danger") },
    locked: { Icon: Lock, border: c("ar-line-bright"), bg: c("ar-void", 0.7), fg: c("ar-text-faint") },
  }[kind];
  return (
    <View accessibilityLabel={kind} style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", borderColor: map.border, backgroundColor: map.bg }}>
      <map.Icon size={11} strokeWidth={3} color={map.fg} />
    </View>
  );
}

// ── Foil ──────────────────────────────────────────────────────────────────

const RAINBOW = [
  "hsla(350, 90%, 65%, 0.7)",
  "hsla(42, 96%, 62%, 0.7)",
  "hsla(115, 80%, 60%, 0.7)",
  "hsla(180, 88%, 62%, 0.7)",
  "hsla(215, 90%, 66%, 0.7)",
  "hsla(275, 85%, 68%, 0.7)",
  "hsla(325, 90%, 66%, 0.7)",
  "hsla(350, 90%, 65%, 0.7)",
];

/**
 * The web's three foil layers over the art. `--pos` (background position)
 * becomes a translate of an oversized rainbow; `--mx/--my` becomes the glare
 * centre. At rest the foil is faint (card-opacity 0.4), brighter while tilted.
 */
function Foil({ tx, ty, active, w }: { tx: SharedValue<number>; ty: SharedValue<number>; active: SharedValue<number>; w: number }) {
  const size = w * 3.5;
  const rainbow = useAnimatedStyle(() => ({
    opacity: interpolate(active.value, [0, 1], [0.18, 0.5]),
    transform: [{ translateX: -size / 2 + w / 2 - tx.value * w * 0.7 }, { translateY: -size / 2 + w * 0.35 - ty.value * w * 0.7 }, { rotate: "25deg" }],
  }));
  const glare = useAnimatedStyle(() => ({
    opacity: interpolate(active.value, [0, 1], [0.2, 0.55]),
    transform: [{ translateX: tx.value * w * 0.5 }, { translateY: ty.value * w * 0.35 }],
  }));
  const sparkle = useAnimatedStyle(() => ({
    opacity: interpolate(active.value, [0, 1], [0.12, 0.42]),
    transform: [{ translateX: -tx.value * 21 }, { translateY: -ty.value * 21 }],
  }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      <Animated.View style={[{ position: "absolute", width: size, height: size, mixBlendMode: "color-dodge" }, rainbow]}>
        <LinearGradient colors={[...RAINBOW, ...RAINBOW, ...RAINBOW] as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {/* Sparkle: the web's six radial points, tiled at 42–68px. */}
      <Animated.View style={[{ position: "absolute", inset: -30, mixBlendMode: "color-dodge" }, sparkle]}>
        <Svg width="100%" height="100%">
          <Defs>
            <Pattern id="sparkle" width={60} height={60} patternUnits="userSpaceOnUse">
              <SvgCircle cx={11} cy={17} r={1} fill="#fff" opacity={0.95} />
              <SvgCircle cx={43} cy={8} r={0.8} fill="#fff" opacity={0.9} />
              <SvgCircle cx={25} cy={44} r={1.1} fill="#fff" opacity={0.95} />
              <SvgCircle cx={52} cy={36} r={0.9} fill="#fff" opacity={0.85} />
              <SvgCircle cx={18} cy={54} r={0.7} fill="#fff" opacity={0.8} />
              <SvgCircle cx={36} cy={27} r={1} fill="#fff" opacity={0.9} />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#sparkle)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { mixBlendMode: "overlay" }, glare]}>
        <Svg width="100%" height="100%">
          <Defs>
            <SvgRadial id="glare" cx="50%" cy="45%" r="75%">
              <Stop offset="0" stopColor="#fff" stopOpacity={0.7} />
              <Stop offset="0.3" stopColor="#fff" stopOpacity={0.25} />
              <Stop offset="0.75" stopColor="#fff" stopOpacity={0} />
            </SvgRadial>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#glare)" />
        </Svg>
      </Animated.View>
    </View>
  );
}
