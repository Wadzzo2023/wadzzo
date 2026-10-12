import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";

import { CAMERA_MODES, type CameraModeId } from "~/components/camera/modes";
import { Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useFeedback } from "~/lib/ar/feedback";
import { useColors } from "~/theme/theme";

export type CameraMode = CameraModeId;

const SEG_H = 30;
const LAYOUT = LinearTransition.springify().stiffness(460).damping(34).mass(0.7);

/**
 * AR | QR | Murals — one camera behind the AR button, three ways to use it
 * (same list as the camera launcher's cards). Only the active mode spells out
 * its name; the others are icons, so three modes fit between Exit and the
 * radar. `router.replace` so switching isn't a place you went — Exit still
 * returns to wherever the camera was opened from. Each screen handles its own
 * permissions, so switching into AR without location still explains why.
 */
export function CameraModeSwitch({ mode }: { mode: CameraMode }) {
  const { c } = useColors();
  const { tap } = useFeedback();
  const [peek, setPeek] = useState<CameraModeId | null>(null);

  useEffect(() => {
    if (!peek) return;
    const id = setTimeout(() => setPeek(null), 1600);
    return () => clearTimeout(id);
  }, [peek]);

  return (
    <Glass style={{ borderRadius: 18, padding: 3 }}>
      <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 2 }}>
        {CAMERA_MODES.map((m) => {
          const active = m.id === mode;
          const soon = m.href === null;
          const showLabel = active || peek === m.id;
          const Icon = m.icon;
          const tint = active ? c(m.accent === "ar-green" ? "ar-green-hot" : m.accent) : soon ? c("ar-text-faint", 0.7) : c("ar-text-dim");
          return (
            <Animated.View key={m.id} layout={LAYOUT}>
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel={soon ? `${m.label}, coming soon` : m.label}
                accessibilityState={{ selected: active, disabled: soon }}
                hitSlop={4}
                onPress={() => {
                  if (active) return;
                  tap();
                  if (!m.href) setPeek(m.id);
                  else router.replace(m.href);
                }}
                style={{
                  height: SEG_H,
                  minWidth: SEG_H + 6,
                  borderRadius: SEG_H / 2,
                  paddingHorizontal: showLabel ? 12 : 0,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  borderWidth: 1,
                  borderColor: active ? c(m.accent, 0.5) : "transparent",
                  backgroundColor: active ? c(m.accent, 0.2) : "transparent",
                }}
              >
                <Icon size={14} strokeWidth={2.4} color={tint} />
                {showLabel && (
                  <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(100)}>
                    <Text className="font-hud text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: active ? c("ar-text") : c("ar-text-faint") }}>
                      {active ? m.label : "Soon"}
                    </Text>
                  </Animated.View>
                )}
                {soon && !showLabel && (
                  <View style={{ position: "absolute", top: 5, right: 6, width: 5, height: 5, borderRadius: 3, backgroundColor: c(m.accent) }} />
                )}
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </Glass>
  );
}

export function CameraModeSwitchBar({ mode, top }: { mode: CameraMode; top: number }) {
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top, left: 0, right: 0, alignItems: "center", zIndex: 40 }}>
      <CameraModeSwitch mode={mode} />
    </View>
  );
}
