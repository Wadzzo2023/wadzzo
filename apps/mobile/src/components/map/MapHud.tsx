import { HelpCircle, Satellite } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";

import { Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { GEO_REASON_TEXT, type GeoReason, type GeoStatus } from "~/lib/ar/location";
import { useColors } from "~/theme/theme";

/** Port of the web's GpsPill — tap it to learn why there's no fix. */
/** `bare` drops its own glass so it can sit inside a shared capsule (map header). */
export function GpsPill({ status, reason, onExplain, bare }: { status: GeoStatus; reason: GeoReason | null; onExplain: (t: string) => void; bare?: boolean }) {
  const { c } = useColors();
  const live = status === "tracking";
  const label = live ? "Live" : status === "prompting" ? "Locating…" : status === "denied" ? "Location off" : "No signal";
  const explanation = reason ? GEO_REASON_TEXT[reason] : null;
  const body = (
    <>
      <Satellite size={11} strokeWidth={2.6} color={live ? c("ar-green-hot") : c("ar-text-faint")} />
      <Text className="font-hud text-[9.5px] font-semibold uppercase tracking-[1.3px]" style={{ color: live ? c("ar-text") : c("ar-text-dim") }}>
        {label}
      </Text>
      {explanation && <HelpCircle size={10} strokeWidth={2.6} color={c("ar-text-faint")} />}
    </>
  );
  return (
    <Pressable disabled={!explanation} onPress={() => explanation && onExplain(explanation)} accessibilityLabel={explanation ? `${label}. Tap to find out why.` : label}>
      {bare ? (
        <View className="h-7 flex-row items-center gap-1.5 px-1.5">{body}</View>
      ) : (
        <Glass className="h-7 flex-row items-center gap-1.5 rounded-full px-2.5" style={{ borderRadius: 14 }}>
          {body}
        </Glass>
      )}
    </Pressable>
  );
}

/** Port of the map's glass toast: short = pill, long = rounded card. */
export function MapToast({ text, onDone, top }: { text: string | null; onDone: () => void; top: number }) {
  const { c } = useColors();
  useEffect(() => {
    if (!text) return;
    const ms = Math.min(9_000, Math.max(2_600, text.length * 55));
    const id = setTimeout(onDone, ms);
    return () => clearTimeout(id);
  }, [text, onDone]);
  if (!text) return null;
  const long = text.length > 42;
  return (
    <Animated.View entering={FadeInUp.springify().stiffness(420).damping(30)} exiting={FadeOutUp} pointerEvents="none" style={{ position: "absolute", top, left: 0, right: 0, alignItems: "center", zIndex: 40 }}>
      <Glass style={{ maxWidth: "86%", borderRadius: long ? 16 : 999, paddingHorizontal: 16, paddingVertical: 8 }}>
        <Text
          className="font-hud text-[11px] font-semibold"
          style={{ color: c("ar-green-hot"), textAlign: "center", letterSpacing: long ? 0.3 : 1.3, textTransform: long ? "none" : "uppercase", lineHeight: long ? 17 : undefined }}
        >
          {text}
        </Text>
      </Glass>
    </Animated.View>
  );
}
