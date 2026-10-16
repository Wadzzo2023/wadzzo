import * as Haptics from "expo-haptics";
import { Pressable, Text } from "react-native";

import { useFeedbackSettings } from "~/lib/ar/feedback";
import { useColors, type MapMode } from "~/theme/theme";

/**
 * Round button that flips the map between the flat 2D map and the tilted 3D
 * city. It names the mode it switches to, the way map apps do.
 */
export function MapModeButton({ mode, onToggle, size = 44 }: { mode: MapMode; onToggle: () => void; size?: number }) {
  const { c } = useColors();
  const { haptics } = useFeedbackSettings();
  const next = mode === "3d" ? "2D" : "3D";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Switch to the ${next} map`}
      onPress={() => {
        if (haptics) void Haptics.selectionAsync();
        onToggle();
      }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: c("ar-line", 0.9),
        backgroundColor: c("ar-surface", 0.8),
      }}
    >
      <Text className="font-hud text-[12px] font-bold tracking-wide text-ar-dim">{next}</Text>
    </Pressable>
  );
}
