import { Camera, Check, Compass, MapPin, Minus, Settings, X, type LucideIcon } from "lucide-react-native";
import { Linking, Pressable, View } from "react-native";

import { Text } from "~/components/ui/Text";
import { PERMISSION_INFO, type PermKey, type PermState } from "~/lib/camera/permissions";
import { useColors } from "~/theme/theme";

const ICONS: Record<PermKey, LucideIcon> = { camera: Camera, location: MapPin, motion: Compass };

const FALLBACK: Partial<Record<PermState, string>> = {
  denied: "Turned off for Wadzzo. Open Settings to allow it.",
  unsupported: "Not available on this device.",
};

/**
 * One permission: what it's for, and its state (granted ✓ / denied ✕ with a
 * way to Settings). Shared by the camera launcher and the AR gate.
 */
export function PermissionRow({ perm, state }: { perm: PermKey; state: PermState }) {
  const { c } = useColors();
  const { title, why } = PERMISSION_INFO[perm];
  const bad = state === "denied";
  const tone =
    state === "granted"
      ? { b: c("ar-green", 0.5), bg: c("ar-green", 0.15), fg: c("ar-green-hot") }
      : bad
        ? { b: c("ar-danger", 0.5), bg: c("ar-danger", 0.15), fg: c("ar-danger") }
        : { b: c("ar-line"), bg: c("ar-text", 0.04), fg: c("ar-text-faint") };
  const StateIcon = state === "granted" ? Check : bad ? X : state === "unsupported" ? Minus : ICONS[perm];
  return (
    <View
      className="flex-row items-start gap-3 rounded-ar border bg-ar-surface p-3.5"
      style={{ borderColor: state === "granted" ? c("ar-green", 0.45) : bad ? c("ar-danger", 0.45) : c("ar-line") }}
      accessibilityLabel={`${title}: ${state === "granted" ? "allowed" : bad ? "turned off" : "not yet allowed"}`}
    >
      <View className="mt-px h-8 w-8 items-center justify-center rounded-[10px] border" style={{ borderColor: tone.b, backgroundColor: tone.bg }}>
        <StateIcon size={15} strokeWidth={state === "pending" ? 2.2 : 3} color={tone.fg} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-hud text-[12.5px] font-bold uppercase tracking-[1.2px] text-ar-text">{title}</Text>
        <Text className="mt-1 text-[11.5px] leading-5 text-ar-faint">{FALLBACK[state] ?? why}</Text>
        {bad && (
          <Pressable onPress={() => void Linking.openSettings()} className="mt-2 flex-row items-center gap-1.5 self-start">
            <Settings size={12} strokeWidth={2.4} color={c("ar-green-hot")} />
            <Text className="font-hud text-[10.5px] font-semibold uppercase tracking-[1.2px] text-ar-green-hot">Open Settings</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
