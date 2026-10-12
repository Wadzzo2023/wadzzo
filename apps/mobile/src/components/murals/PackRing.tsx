import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, ZoomOut } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { useShallow } from "zustand/react/shallow";

import { Text } from "~/components/ui/Text";
import { packProgress, useMuralPack, usePackSheet } from "~/lib/murals/pack";
import { useColors } from "~/theme/theme";

/**
 * ── PackRing (mobile) ──────────────────────────────────────────────────────
 *
 * While the mural pack installs, a progress ring wraps the raised AR camera
 * button — the pack "charging" the camera (placement chosen 2026-10-05). A
 * small % badge rides on top; tapping it opens the game panel (the AR button
 * itself still opens the launcher). Flashes green when it finishes.
 * `size` = the launcher key's diameter; the ring sits 7 px outside it.
 */
export function PackRing({ size }: { size: number }) {
  const { c } = useColors();
  // Always on screen (tab bar): only what the ring draws, not speed/retry ticks.
  const s = useMuralPack(useShallow((x) => ({ status: x.status, receivedBytes: x.receivedBytes, totalBytes: x.totalBytes })));
  const open = usePackSheet((x) => x.setOpen);
  const [flash, setFlash] = useState(false);

  // Flash green once when an install finishes (store event → no setState in the effect body).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = useMuralPack.subscribe((st, prev) => {
      if (!st.justFinished || st.justFinished === prev.justFinished) return;
      setFlash(true);
      if (t) clearTimeout(t);
      t = setTimeout(() => setFlash(false), 1600);
    });
    return () => {
      unsub();
      if (t) clearTimeout(t);
    };
  }, []);

  const busy = s.status === "checking" || s.status === "downloading" || s.status === "verifying" || s.status === "error";
  if (!busy && !flash) return null;
  const failed = s.status === "error";
  const p = flash ? 1 : packProgress(s);
  const D = size + 14;
  const R = D / 2 - 3;
  const C = 2 * Math.PI * R;

  return (
    <Animated.View entering={FadeIn.duration(300)} exiting={ZoomOut.duration(350)} pointerEvents="box-none" style={{ position: "absolute", width: D, height: D, left: -7, top: -7 }}>
      <Svg width={D} height={D} pointerEvents="none">
        <Defs>
          <LinearGradient id="packring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#38d9f5" />
            <Stop offset="1" stopColor={c("rarity-epic")} />
          </LinearGradient>
        </Defs>
        <Circle cx={D / 2} cy={D / 2} r={R} fill="none" stroke={c("rarity-epic", 0.22)} strokeWidth={4} />
        <Circle
          cx={D / 2}
          cy={D / 2}
          r={R}
          fill="none"
          stroke={flash ? c("ar-green-hot") : failed ? c("ar-danger") : "url(#packring)"}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${C} ${C}`}
          strokeDashoffset={C * (1 - p)}
          transform={`rotate(-90 ${D / 2} ${D / 2})`}
        />
      </Svg>
      {!flash && (
        <Pressable
          onPress={() => open(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={failed ? "Mural pack paused — show details" : `Mural pack ${Math.floor(p * 100)}% — show details`}
          style={{ position: "absolute", top: -12, alignSelf: "center" }}
        >
          <View style={{ borderRadius: 999, borderWidth: 1, borderColor: failed ? c("ar-danger", 0.7) : c("rarity-epic", 0.7), backgroundColor: c("ar-void"), paddingHorizontal: 6, paddingVertical: 1 }}>
            <Text className="font-hud text-[9.5px] font-bold" style={{ color: failed ? c("ar-danger") : c("rarity-epic") }}>
              {failed ? "PAUSED" : s.status === "verifying" ? "CHECK" : `${Math.floor(p * 100)}%`}
            </Text>
          </View>
        </Pressable>
      )}
    </Animated.View>
  );
}
