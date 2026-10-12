import { Compass, LocateFixed, Settings } from "lucide-react-native";
import { Linking, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArButton } from "~/components/ui/ArButton";
import { PulseRing } from "~/components/ui/PulseDot";
import { Bevel } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { GEO_REASON_TEXT, type GeoReason, type GeoStatus } from "~/lib/ar/location";
import { useColors } from "~/theme/theme";

const STEPS = {
  ios: { title: "Turn on location for Wadzzo", steps: ["Open Settings", "Scroll to Wadzzo → Location", "Choose “While Using the App” and turn on Precise Location"] },
  android: { title: "Turn on location for Wadzzo", steps: ["Open Settings", "Apps → Wadzzo → Permissions → Location", "Choose “Allow only while using the app” and turn on “Use precise location”"] },
} as const;

/** For a slow fix (permission is fine): things that actually speed GPS up. */
const SLOW_TIPS = {
  title: "Help your phone find you",
  steps: ["Step outside or near a window", "Turn on Wi-Fi — it locates you faster, even unconnected", "Keep Wadzzo open for a few seconds"],
};
/** Location Services switched off for the whole phone. */
const SERVICES_OFF = {
  title: "Turn on Location",
  steps: ["Swipe down from the top of the screen", "Tap Location to turn it on", "Come back and tap Enable location"],
};

/**
 * Port of the web's LocationGate. On native a denied permission can't be
 * re-asked from inside the app, so "Open Settings" is the real fix — the web
 * version's browser-site instructions become app-permission steps.
 */
export function LocationGate({ status, reason, onRetry }: { status: GeoStatus; reason: GeoReason | null; onRetry: () => void }) {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const asking = status === "prompting";
  const guide = STEPS[Platform.OS === "ios" ? "ios" : "android"];
  return (
    <ScrollView className="absolute inset-0 z-40 bg-ar-bg" contentContainerStyle={{ alignItems: "center", paddingHorizontal: 24, paddingTop: insets.top + 56, paddingBottom: 32 }}>
      <View className="mb-5 h-16 w-16 items-center justify-center">
        <View className="absolute inset-0 rounded-2xl border bg-ar-surface" style={{ borderColor: c("ar-green", 0.3) }} />
        <PulseRing color={c("ar-green-hot", 0.5)} size={64} />
        <Compass size={28} strokeWidth={2} color={c("ar-green-hot")} />
      </View>
      <Text className="font-hud text-center text-[19px] font-bold text-ar-text">{asking ? "Finding you…" : "Wadzzo needs your location"}</Text>
      <Text className="mt-2.5 max-w-[19rem] text-center text-[13px] leading-5 text-ar-dim">
        {reason ? GEO_REASON_TEXT[reason] : "Every drop sits at a real place. Without your position there's nothing to walk to."}
      </Text>
      <View className="mt-5 w-full max-w-[19rem] gap-2">
        {reason === "denied" ? (
          <ArButton variant="primary" size="lg" block icon={Settings} onPress={() => void Linking.openSettings()}>
            Open Settings
          </ArButton>
        ) : (
          <ArButton variant="primary" size="lg" block icon={LocateFixed} busy={asking} onPress={onRetry}>
            {asking ? "Locating" : "Enable location"}
          </ArButton>
        )}
        {reason === "denied" && (
          <ArButton variant="ghost" size="md" block onPress={onRetry}>
            I've turned it on
          </ArButton>
        )}
      </View>
      {reason && (
        <Bevel className="mt-5 w-full max-w-[19rem] rounded-ar p-4" style={{ borderRadius: 16 }}>
          <Text className="font-hud mb-2.5 text-[10px] font-semibold uppercase tracking-[1.6px] text-ar-dim">{(reason === "denied" ? guide : reason === "unavailable" ? SERVICES_OFF : SLOW_TIPS).title}</Text>
          {(reason === "denied" ? guide : reason === "unavailable" ? SERVICES_OFF : SLOW_TIPS).steps.map((step, i) => (
            <View key={i} className="mb-2 flex-row gap-2.5">
              <Text className="font-hud w-4 text-[10px] font-bold text-ar-green">{i + 1}</Text>
              <Text className="flex-1 text-[12px] leading-5 text-ar-faint">{step}</Text>
            </View>
          ))}
        </Bevel>
      )}
    </ScrollView>
  );
}
