import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { ArrowUpRight, Camera, Check, Compass, MapPin, Settings, type LucideIcon } from "lucide-react-native";
import { useCallback, useState } from "react";
import { AppState, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInRight, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { useTabBarHeight } from "~/components/shell/BottomTabBar";
import { ScreenHeader } from "~/components/shell/ScreenHeader";
import { ArButton } from "~/components/ui/ArButton";
import { Grid } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useFeedback } from "~/lib/ar/feedback";
import { checkPermissions, PERMISSION_INFO, requestPermissions, type PermCheck, type PermKey } from "~/lib/camera/permissions";
import { useColors } from "~/theme/theme";
import type { TokenName } from "~/theme/tokens";
import { packProgress, useMuralPack } from "~/lib/murals/pack";

import { CAMERA_MODES, cameraMode, type CameraModeDef, type CameraModeId } from "./modes";
import { PermissionRow } from "./PermissionRow";

const PERM_ICONS: Record<PermKey, LucideIcon> = { camera: Camera, location: MapPin, motion: Compass };
const PRESS = { stiffness: 520, damping: 30 };

/** The brighter tone of an accent, for icons and small type. */
const hot = (accent: TokenName): TokenName => (accent === "ar-green" ? "ar-green-hot" : accent);

type Step = { kind: "pick" } | { kind: "perms"; mode: CameraModeId };
type Checks = Partial<Record<CameraModeId, PermCheck>>;

/**
 * ── CameraLauncher ─────────────────────────────────────────────────────────
 *
 * The /camera page the AR button opens: a bento of the camera's three ways
 * in (AR, QR, Murals). Each card shows up front whether its permissions are
 * already allowed. Picking one that's ready goes straight in; otherwise the page
 * steps to what it needs and why, asks, and then goes in. It's a (hidden)
 * tab, so the bottom bar stays usable. Coming back from
 * Settings re-reads the permissions, so it's never stale.
 */
export function CameraLauncher() {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [checks, setChecks] = useState<Checks>({});
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A tab stays mounted: each visit starts on the modes with fresh
  // permission states (and re-reads them on return from Settings).
  useFocusEffect(
    useCallback(() => {
      let live = true;
      const refresh = () =>
        readChecks().then((next) => {
          if (live) setChecks(next);
        });
      void refresh();
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "active") void refresh();
      });
      return () => {
        live = false;
        sub.remove();
        setStep({ kind: "pick" });
        setError(null);
      };
    }, []),
  );

  const go = (mode: CameraModeDef) => {
    if (mode.href) router.push(mode.href);
  };

  const pick = async (mode: CameraModeDef) => {
    if (!mode.href) return;
    setError(null);
    const check = checks[mode.id] ?? (await checkPermissions(mode.needs));
    if (check.ready) go(mode);
    else setStep({ kind: "perms", mode: mode.id });
  };

  const allow = async (mode: CameraModeDef) => {
    if (checks[mode.id]?.blocked) {
      void Linking.openSettings();
      return;
    }
    setRequesting(true);
    setError(null);
    const next = await requestPermissions(mode.needs);
    setChecks((c) => ({ ...c, [mode.id]: next }));
    setRequesting(false);
    if (next.ready) go(mode);
    else if (next.states.camera !== "granted") setError(`${mode.title} needs the camera to work.`);
    else setError("Without location, drops can't be placed around you. You can still look around.");
  };

  const tabBarHeight = useTabBarHeight();
  const perms = step.kind === "perms" ? cameraMode(step.mode) : null;
  const permsCheck = step.kind === "perms" ? checks[step.mode] : undefined;
  const back = () => {
    setError(null);
    setStep({ kind: "pick" });
  };

  return (
    <View className="flex-1 bg-ar-bg">
      <ScreenHeader
        // A tab page like the others (profile avatar); the permissions step
        // gets a back button that returns to the modes.
        back={perms != null}
        onBack={back}
        eyebrow={perms ? perms.title : "Camera"}
        title={perms ? (permsCheck?.blocked ? "Turn on access" : "Allow access") : "Collect"}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: tabBarHeight + 48 }}>
        {perms ? (
          <PermsStep key={perms.id} mode={perms} check={permsCheck} requesting={requesting} error={error} onAllow={(m) => void allow(m)} onContinue={go} />
        ) : (
          <PickStep checks={checks} onPick={(m) => void pick(m)} />
        )}
      </ScrollView>
    </View>
  );
}

/** Current permission state of every openable mode (no prompting). */
async function readChecks(): Promise<Checks> {
  const entries = await Promise.all(CAMERA_MODES.filter((m) => m.href).map(async (m) => [m.id, await checkPermissions(m.needs)] as const));
  return Object.fromEntries(entries) as Checks;
}

/* ── Step 1: the bento ──────────────────────────────────────────────────── */

function PickStep({ checks, onPick }: { checks: Checks; onPick: (m: CameraModeDef) => void }) {
  const [ar, qr, murals] = CAMERA_MODES as [CameraModeDef, CameraModeDef, CameraModeDef];
  return (
    <Animated.View entering={FadeIn.duration(180)}>
      <Text className="mb-4 text-[13px] leading-5 text-ar-dim">How do you want to collect? Pick a way in — each shows whether it&apos;s ready to go.</Text>
      <View style={{ gap: 12 }}>
        <BentoCard mode={ar} check={checks.ar} size="hero" index={0} onPress={onPick} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <BentoCard mode={qr} check={checks.qr} size="tile" index={1} onPress={onPick} />
          <BentoCard mode={murals} size="tile" index={2} onPress={onPick} />
        </View>
      </View>
    </Animated.View>
  );
}

function BentoCard({ mode, check, size, index, onPress }: { mode: CameraModeDef; check?: PermCheck; size: "hero" | "tile"; index: number; onPress: (m: CameraModeDef) => void }) {
  const { c } = useColors();
  const { tap } = useFeedback();
  const soon = mode.href === null;
  const hero = size === "hero";
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const Icon = mode.icon;

  return (
    <Animated.View entering={FadeInDown.delay(60 + index * 60).springify().stiffness(380).damping(30)} style={hero ? undefined : { flex: 1 }}>
      <Pressable
        disabled={soon}
        onPressIn={() => scale.set(withSpring(0.97, PRESS))}
        onPressOut={() => scale.set(withSpring(1, PRESS))}
        onPress={() => {
          tap();
          onPress(mode);
        }}
        accessibilityRole="button"
        accessibilityLabel={soon ? `${mode.title}, coming soon` : `${mode.title}. ${mode.blurb}`}
        accessibilityState={{ disabled: soon }}
      >
        <Animated.View
          style={[
            pressStyle,
            {
              minHeight: hero ? 178 : 176,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: c(mode.accent, soon ? 0.2 : 0.38),
              backgroundColor: c("ar-surface-2"),
              overflow: "hidden",
              padding: hero ? 18 : 14,
            },
          ]}
        >
          <LinearGradient colors={[c(mode.accent, soon ? 0.08 : 0.2), c(mode.accent, 0.02)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Grid size={hero ? 26 : 22} opacity={0.06} />
          {/* Oversized mark bleeding off the corner — the card's texture. */}
          <View pointerEvents="none" style={{ position: "absolute", right: hero ? -18 : -14, bottom: hero ? -22 : -16, transform: [{ rotate: "-10deg" }] }}>
            <Icon size={hero ? 132 : 92} strokeWidth={1.2} color={c(mode.accent, soon ? 0.07 : 0.13)} />
          </View>

          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View
              style={{
                width: hero ? 46 : 40,
                height: hero ? 46 : 40,
                borderRadius: 13,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: c(mode.accent, soon ? 0.25 : 0.5),
                backgroundColor: c(mode.accent, soon ? 0.08 : 0.18),
              }}
            >
              <Icon size={hero ? 22 : 19} strokeWidth={2.2} color={c(hot(mode.accent), soon ? 0.55 : 1)} />
            </View>
            {soon ? (
              <View style={{ borderRadius: 999, borderWidth: 1, borderColor: c(mode.accent, 0.4), backgroundColor: c(mode.accent, 0.14), paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text className="font-hud text-[9px] font-bold uppercase tracking-[1.6px]" style={{ color: c(hot(mode.accent)) }}>
                  Soon
                </Text>
              </View>
            ) : (
              <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: c(hot(mode.accent)) }}>
                <ArrowUpRight size={16} strokeWidth={2.6} color={c("ar-void")} />
              </View>
            )}
          </View>

          <View style={{ flex: 1, justifyContent: "flex-end", marginTop: hero ? 18 : 14, opacity: soon ? 0.6 : 1 }}>
            <Text className={hero ? "font-hud text-[20px] font-bold text-ar-text" : "font-hud text-[15px] font-bold text-ar-text"} numberOfLines={1} adjustsFontSizeToFit>
              {mode.title}
            </Text>
            <Text className={hero ? "mt-1 max-w-[16rem] text-[12.5px] leading-5 text-ar-dim" : "mt-1 text-[11.5px] leading-[17px] text-ar-dim"} numberOfLines={hero ? 2 : 3}>
              {mode.blurb}
            </Text>
            {!soon && <Readiness mode={mode} check={check} />}
            {mode.id === "murals" && <PackChip />}
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** Which permissions this mode uses, each ticked once allowed, plus a one-word verdict. */
/** Murals tile: the pack's install state, with a mini bar while it downloads. */
function PackChip() {
  const { c } = useColors();
  const s = useMuralPack();
  if (s.status === "idle") return null;
  if (s.status === "ready") {
    return (
      <Text className="font-hud mt-2 text-[9.5px] font-bold uppercase tracking-[1.4px]" style={{ color: c("ar-green-hot") }}>
        ✓ Mural pack ready
      </Text>
    );
  }
  const pct = Math.floor(packProgress(s) * 100);
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text className="font-hud text-[9.5px] font-bold uppercase tracking-[1.4px]" style={{ color: c("rarity-epic") }}>
          {s.status === "error" ? "Pack paused" : s.status === "verifying" ? "Verifying pack" : "Downloading pack"}
        </Text>
        {s.status !== "error" && (
          <Text className="font-hud text-[9.5px] font-bold" style={{ color: c("rarity-epic") }}>
            {pct}%
          </Text>
        )}
      </View>
      <View style={{ marginTop: 4, height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: c("ar-void", 0.6) }}>
        <View style={{ height: 6, width: `${Math.max(3, pct)}%`, borderRadius: 3, backgroundColor: c("rarity-epic") }} />
      </View>
    </View>
  );
}

function Readiness({ mode, check }: { mode: CameraModeDef; check?: PermCheck }) {
  const { c } = useColors();
  // Motion rides on location, so it isn't its own chip here.
  const shown = mode.needs.filter((k) => k !== "motion");
  const ready = check?.ready;
  return (
    <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6 }}>
      {shown.map((k) => {
        const granted = check?.states[k] === "granted";
        const I = PERM_ICONS[k];
        return (
          <View
            key={k}
            accessibilityLabel={`${PERMISSION_INFO[k].title} ${granted ? "allowed" : "not allowed yet"}`}
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: granted ? c("ar-green", 0.5) : c("ar-line"),
              backgroundColor: granted ? c("ar-green", 0.14) : c("ar-surface", 0.8),
            }}
          >
            <I size={12} strokeWidth={2.3} color={granted ? c("ar-green-hot") : c("ar-text-faint")} />
            {granted && (
              <View style={{ position: "absolute", right: -3, bottom: -3, width: 12, height: 12, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: c("ar-green-hot") }}>
                <Check size={8} strokeWidth={4} color={c("ar-void")} />
              </View>
            )}
          </View>
        );
      })}
      {check && (
        <Text className="font-hud ml-1 text-[9.5px] font-semibold uppercase tracking-[1.4px]" style={{ color: ready ? c("ar-green-hot") : c("ar-text-faint") }}>
          {ready ? "Ready" : "Needs access"}
        </Text>
      )}
    </View>
  );
}

/* ── Step 2: what this mode needs ───────────────────────────────────────── */

function PermsStep({
  mode,
  check,
  requesting,
  error,
  onAllow,
  onContinue,
}: {
  mode: CameraModeDef;
  check?: PermCheck;
  requesting: boolean;
  error: string | null;
  onAllow: (m: CameraModeDef) => void;
  onContinue: (m: CameraModeDef) => void;
}) {
  const Icon = mode.icon;
  const cameraOk = check?.states.camera === "granted";
  // Location said no but the camera is fine: AR still opens (empty scene), so offer it.
  const canContinue = cameraOk && !check?.ready && mode.id === "ar";

  return (
    <Animated.View entering={FadeInRight.springify().stiffness(380).damping(32)}>
      <Text className="text-[13px] leading-5 text-ar-dim">
        {check?.blocked
          ? "Wadzzo was told no earlier, so your phone won't ask again. Switch it on in Settings, then come back — this updates on its own."
          : `${mode.title} needs these to work. You'll only be asked once.`}
      </Text>

      <View className="mt-4 gap-2">
        {mode.needs.map((k) => (
          <PermissionRow key={k} perm={k} state={check?.states[k] ?? "pending"} />
        ))}
      </View>

      {error && <Text className="mt-3 text-center text-[12px] leading-5 text-ar-danger">{error}</Text>}

      <View className="mt-5 gap-2">
        {check?.ready ? (
          <ArButton variant="primary" size="lg" block icon={Icon} onPress={() => onContinue(mode)}>
            {`Open ${mode.label}`}
          </ArButton>
        ) : (
          <ArButton variant="primary" size="lg" block icon={check?.blocked ? Settings : Camera} busy={requesting} onPress={() => onAllow(mode)}>
            {requesting ? "Asking…" : check?.blocked ? "Open Settings" : `Allow & open ${mode.label}`}
          </ArButton>
        )}
        {canContinue && (
          <ArButton variant="ghost" block onPress={() => onContinue(mode)}>
            Continue without location
          </ArButton>
        )}
      </View>
    </Animated.View>
  );
}
