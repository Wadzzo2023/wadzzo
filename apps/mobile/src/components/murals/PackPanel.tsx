import { Check, Download, Lightbulb, RotateCcw, ShieldCheck, TriangleAlert, Wifi } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Pattern, Rect, Stop } from "react-native-svg";

import { ArButton } from "~/components/ui/ArButton";
import { Text } from "~/components/ui/Text";
import { useDecorativeMotion } from "~/lib/motion";
import { formatBytes, packProgress, startMuralPack, useMuralPack, type PackStatus } from "~/lib/murals/pack";
import { useColors } from "~/theme/theme";

import { PackArt } from "./PackArt";

/**
 * ── PackPanel (mobile) ─────────────────────────────────────────────────────
 *
 * Port of wadzzoAR's game-style "resource pack" panel: emblem + ring, stage
 * track (Connect → Download → Verify → Ready), striped animated bar with %,
 * speed and time left, rotating tips. No cancel. `compact` = the strip under
 * the Murals camera while the pack installs.
 */

export const PACK_TIPS = [
  "Graffiti counts too — any street art can be collected.",
  "The first 3 people to find a mural earn a discovery bonus.",
  "Turn slowly left, then right: it proves the wall is real.",
  "You can scan each mural up to 3 times a day.",
  "Name a mural you discovered — everyone sees it on the map.",
  "Photos of a screen don't count. Find the real wall!",
];

const STAGES = ["Connect", "Download", "Verify", "Ready"];
const stageIndex = (s: PackStatus) => (s === "checking" ? 0 : s === "downloading" ? 1 : s === "verifying" ? 2 : s === "ready" ? 3 : 1);

function eta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
}

function useTip(enabled: boolean) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setI((n) => (n + 1) % PACK_TIPS.length), 4500);
    return () => clearInterval(t);
  }, [enabled]);
  return PACK_TIPS[i]!;
}

export function PackBar({ progress, active, failed }: { progress: number; active: boolean; failed?: boolean }) {
  const { c } = useColors();
  const motion = useDecorativeMotion();
  const fill = useSharedValue(progress);
  const shift = useSharedValue(0);
  useEffect(() => {
    fill.value = withSpring(progress, { stiffness: 120, damping: 24 });
  }, [progress, fill]);
  useEffect(() => {
    shift.value = 0;
    if (active && motion) shift.value = withRepeat(withTiming(28, { duration: 800, easing: Easing.linear }), -1, false);
  }, [active, motion, shift]);
  // Percentage width: a measured px width read inside the worklet stayed at
  // its first value (0), so the bar sat at the 4 px minimum while % moved.
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(2, Math.min(1, fill.value) * 100)}%` }));
  const stripeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value - 28 }] }));

  return (
    <View style={{ height: 12, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: c("ar-void", 0.6) }}>
      <Animated.View style={[{ height: "100%", borderRadius: 6, overflow: "hidden" }, fillStyle]}>
        <Svg width="100%" height="100%" style={{ position: "absolute" }}>
          <Defs>
            <LinearGradient id="packfill" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={failed ? c("ar-danger") : "#22d3ee"} />
              <Stop offset="0.5" stopColor={failed ? c("ar-danger") : c("rarity-epic")} />
              <Stop offset="1" stopColor={failed ? c("ar-danger") : "#d946ef"} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#packfill)" />
        </Svg>
        {active && (
          <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, left: 0, width: 2000, opacity: 0.35 }, stripeStyle]}>
            <Svg width={2000} height={12}>
              <Defs>
                <Pattern id="stripes" width={14} height={12} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                  <Rect width={7} height={12} fill="#fff" />
                </Pattern>
              </Defs>
              <Rect width={2000} height={12} fill="url(#stripes)" />
            </Svg>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

export function PackPanel({ compact = false }: { compact?: boolean }) {
  const { c } = useColors();
  const s = useMuralPack();
  const p = packProgress(s);
  const pct = Math.floor(p * 100);
  const active = s.status === "downloading" || s.status === "checking" || s.status === "verifying";
  const tip = useTip(active);
  const failed = s.status === "error";
  const done = s.status === "ready";
  const si = stageIndex(s.status);
  const epic = c("rarity-epic");
  const details = `${formatBytes(s.receivedBytes)} / ${formatBytes(s.totalBytes)} · ${formatBytes(s.speed)}/s · ${eta((s.totalBytes - s.receivedBytes) / Math.max(1, s.speed))} left`;

  if (compact) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch" }}>
        <PackArt size={46} progress={p} done={done} spinning={s.status === "checking" || s.status === "verifying"} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text className="font-hud text-[11px] font-bold uppercase tracking-[1.4px] text-ar-text" numberOfLines={1}>
              {failed ? "Mural pack paused" : done ? "Mural pack ready" : s.status === "verifying" ? "Verifying files…" : "Downloading mural pack"}
            </Text>
            <Text className="font-hud text-[13px] font-bold" style={{ color: epic }}>
              {done ? 100 : pct}%
            </Text>
          </View>
          <View style={{ marginTop: 6 }}>
            <PackBar progress={done ? 1 : p} active={active} failed={failed} />
          </View>
          <Text className="mt-1 text-[10.5px] text-ar-faint" numberOfLines={1}>
            {failed ? s.error?.message : s.status === "downloading" ? details : tip}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <PackArt size={92} progress={p} done={done} spinning={s.status === "checking" || s.status === "verifying"} />
        <View style={{ flex: 1 }}>
          <Text className="font-hud text-[10px] font-semibold uppercase tracking-[2.8px]" style={{ color: epic }}>
            Resource pack
          </Text>
          <Text className="font-hud text-[20px] font-bold text-ar-text">Mural Pack {s.version ? `v${s.version}` : ""}</Text>
          <Text className="mt-0.5 text-[11.5px] text-ar-dim">The street-art finder for the Murals camera · {s.totalBytes ? formatBytes(s.totalBytes) : "≈23 MB"}</Text>
        </View>
      </View>

      <View style={{ marginTop: 20, flexDirection: "row", alignItems: "center" }}>
        {STAGES.map((label, i) => {
          const reached = i < si || done;
          const current = i === si && !done;
          return (
            <View key={label} style={{ flexDirection: "row", alignItems: "center", flex: i < STAGES.length - 1 ? 1 : 0 }}>
              <View style={{ alignItems: "center" }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    alignItems: "center",
                    justifyContent: "center",
                    borderColor: reached || current ? (current && failed ? c("ar-danger") : epic) : c("ar-line"),
                    backgroundColor: reached ? epic : "transparent",
                  }}
                >
                  {reached ? (
                    <Check size={12} strokeWidth={3} color="#fff" />
                  ) : (
                    <Text className="text-[10px] font-bold" style={{ color: current ? epic : c("ar-text-faint") }}>
                      {i + 1}
                    </Text>
                  )}
                </View>
                <Text className="font-hud mt-1 text-[9px] font-bold uppercase tracking-[1.2px]" style={{ color: reached || current ? c("ar-text") : c("ar-text-faint") }}>
                  {label}
                </Text>
              </View>
              {i < STAGES.length - 1 && <View style={{ flex: 1, height: 2, marginHorizontal: 4, marginBottom: 16, backgroundColor: i < si || done ? epic : c("ar-line") }} />}
            </View>
          );
        })}
      </View>

      <View style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <Text className="font-hud text-[12px] font-bold uppercase tracking-[1.4px] text-ar-text">
            {failed ? "Paused" : done ? "Installed" : s.status === "verifying" ? "Verifying files…" : s.status === "checking" ? "Connecting…" : "Downloading"}
          </Text>
          <Text className="font-hud text-[26px] font-bold" style={{ color: epic }}>
            {done ? 100 : pct}%
          </Text>
        </View>
        <PackBar progress={done ? 1 : p} active={active} failed={failed} />
        <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
          <Text className="text-[11px] text-ar-dim">
            {formatBytes(done ? s.totalBytes : s.receivedBytes)} / {s.totalBytes ? formatBytes(s.totalBytes) : "—"}
          </Text>
          <Text className="text-[11px] text-ar-dim">{s.status === "downloading" ? `${formatBytes(s.speed)}/s` : "—"}</Text>
          <Text className="text-[11px] text-ar-dim">{s.status === "downloading" ? `${eta((s.totalBytes - s.receivedBytes) / Math.max(1, s.speed))} left` : "—"}</Text>
        </View>
      </View>

      {failed && s.error && (
        <View style={{ marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: c("ar-danger", 0.4), backgroundColor: c("ar-danger", 0.1), padding: 14 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {s.error.code === "offline" ? <Wifi size={15} color={c("ar-danger")} /> : <TriangleAlert size={15} color={c("ar-danger")} />}
            <Text className="flex-1 text-[12px] text-ar-text">{s.error.message}</Text>
          </View>
          <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text className="text-[11px] text-ar-faint">{s.retryIn != null ? `Retrying in ${s.retryIn}s` : ""}</Text>
            <ArButton size="sm" icon={RotateCcw} onPress={() => void startMuralPack()}>
              Retry now
            </ArButton>
          </View>
        </View>
      )}

      {done ? (
        <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 16, borderWidth: 1, borderColor: c("ar-green", 0.4), backgroundColor: c("ar-green", 0.1), padding: 12 }}>
          <ShieldCheck size={15} color={c("ar-green-hot")} />
          <Text className="flex-1 text-[12px] text-ar-text">Verified and installed. The Murals camera is ready.</Text>
        </View>
      ) : (
        !failed && (
          <View style={{ marginTop: 16, minHeight: 44, flexDirection: "row", gap: 8, borderRadius: 16, borderWidth: 1, borderColor: c("ar-line"), padding: 12 }}>
            <Lightbulb size={15} color={c("rarity-legendary")} />
            <Animated.View key={tip} entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ flex: 1 }}>
              <Text className="text-[12px] leading-[18px] text-ar-dim">{tip}</Text>
            </Animated.View>
          </View>
        )
      )}

      {!done && (
        <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Download size={11} color={c("ar-text-faint")} />
          <Text className="text-[10.5px] text-ar-faint">Keep using Wadzzo — this finishes in the background.</Text>
        </View>
      )}
    </View>
  );
}
