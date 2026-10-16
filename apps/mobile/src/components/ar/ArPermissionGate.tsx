import { router } from "expo-router";
import { Camera, X } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Rect, RadialGradient as SvgRadialGradient, Stop } from "react-native-svg";

import { PermissionRow } from "~/components/camera/PermissionRow";
import { ArButton } from "~/components/ui/ArButton";
import { Grid } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import type { PermKey, PermState } from "~/lib/camera/permissions";
import { useColors } from "~/theme/theme";

export type { PermState };

const PERMS: PermKey[] = ["camera", "location", "motion"];

/**
 * Port of the web's ArPermissionGate: every permission says what it's for,
 * one tap asks for all of them. On native a denied permission can't be
 * re-asked in-app, so each denied row offers Settings.
 *
 * Shown as a dialog card over the dark camera backdrop, not a full page. The
 * camera launcher asks for these itself, so this only appears when /ar is
 * opened some other way (the map's "Capture in AR", a link) before anything
 * was asked.
 */
export function ArPermissionGate({ states, requesting, onRequest, error }: { states: Record<"camera" | "location" | "motion", PermState>; requesting: boolean; onRequest: () => void; error: string | null }) {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const anyDenied = Object.values(states).some((s) => s === "denied");
  const close = () => (router.canGoBack() ? router.back() : router.replace("/map"));

  return (
    <View className="flex-1 bg-ar-void">
      <Grid />
      {/* Static radial glow instead of an 80px blurred boxShadow. */}
      <View pointerEvents="none" style={{ position: "absolute", left: "50%", top: "30%", width: 560, height: 560, marginLeft: -280, marginTop: -280 }}>
        <Svg width={560} height={560}>
          <Defs>
            <SvgRadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={c("ar-green")} stopOpacity={0.18} />
              <Stop offset="0.55" stopColor={c("ar-green")} stopOpacity={0.08} />
              <Stop offset="1" stopColor={c("ar-green")} stopOpacity={0} />
            </SvgRadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#glow)" />
        </Svg>
      </View>

      <ScrollView bounces={false} contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }}>
        <Animated.View
          entering={ZoomIn.springify().stiffness(420).damping(30)}
          accessibilityViewIsModal
          style={{ alignSelf: "center", width: "100%", maxWidth: 400, borderRadius: 28, borderWidth: 1, borderColor: c("ar-line"), backgroundColor: c("ar-surface"), padding: 20 }}
        >
          <Animated.View entering={FadeIn.duration(180)}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text className="font-hud text-[21px] font-bold leading-7 text-ar-text">Enter AR</Text>
                <Text className="mt-1 text-[12.5px] leading-5 text-ar-dim">Point your phone at the world and the drops around you appear where they actually are.</Text>
              </View>
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center", borderColor: c("ar-line"), backgroundColor: c("ar-surface-2") }}
              >
                <X size={16} strokeWidth={2.4} color={c("ar-text-dim")} />
              </Pressable>
            </View>

            <View className="mt-4 gap-2">
              {PERMS.map((key) => (
                <PermissionRow key={key} perm={key} state={states[key]} />
              ))}
            </View>

            {error && <Text className="mt-3 text-center text-[12px] leading-5 text-ar-danger">{error}</Text>}

            <View className="mt-4">
              <ArButton variant="primary" size="lg" block icon={Camera} busy={requesting} onPress={onRequest}>
                {requesting ? "Asking…" : anyDenied ? "Try again" : "Allow & enter AR"}
              </ArButton>
            </View>
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
