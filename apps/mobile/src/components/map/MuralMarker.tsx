import { Image } from "expo-image";
import { Check } from "lucide-react-native";
import { memo } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

import { Text } from "~/components/ui/Text";
import type { AreaMural } from "~/lib/murals/api";
import { useColors } from "~/theme/theme";

/**
 * ── MuralMarker ────────────────────────────────────────────────────────────
 *
 * Port of wadzzoAR's MuralMarker: a portrait frame showing the mural's own
 * cover — the marker language's third shape (round = tap, square = auto,
 * frame = scan with the Murals camera).
 *
 *   approved            100%, solid epic border
 *   unverified          60%, dashed border, "?"
 *   at today's limit    80%, gold tick
 *
 * GPU rules: no boxShadow, even when selected — a thicker border and the
 * same spring pop as PinMarker instead.
 */
export const MuralMarker = memo(function MuralMarker({
  mural,
  dailyLimit,
  selected,
  onSelect,
}: {
  mural: AreaMural;
  dailyLimit: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { c } = useColors();
  const verified = mural.status === "APPROVED";
  const done = mural.scansToday >= dailyLimit;
  const pop = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(selected ? 1.18 : 1, { stiffness: 480, damping: 24 }),
      },
    ],
  }));

  return (
    <Pressable
      onPress={() => onSelect(mural.id)}
      accessibilityRole="button"
      accessibilityLabel={`${mural.title} — ${verified ? "mural" : "unverified mural"}`}
      hitSlop={6}
      style={{
        width: 50,
        height: 66,
        alignItems: "center",
        opacity: selected ? 1 : done ? 0.8 : verified ? 1 : 0.6,
      }}
    >
      <Animated.View
        style={[
          {
            width: 42,
            height: 52,
            borderRadius: 9,
            borderWidth: selected ? 3 : 2.5,
            borderStyle: verified ? "solid" : "dashed",
            borderColor: c("rarity-epic"),
            overflow: "hidden",
            backgroundColor: c("ar-surface"),
            transformOrigin: "bottom",
          },
          pop,
        ]}
      >
        <Image
          source={{ uri: mural.coverUrl }}
          style={{ flex: 1 }}
          contentFit="cover"
          recyclingKey={mural.id}
          cachePolicy="memory-disk"
        />
      </Animated.View>
      {!verified && (
        <View
          style={{
            position: "absolute",
            top: -4,
            right: 0,
            width: 16,
            height: 16,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.7)",
            backgroundColor: c("rarity-epic"),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text className="font-hud text-[10px] font-bold text-white">?</Text>
        </View>
      )}
      {done && (
        <View
          style={{
            position: "absolute",
            top: -4,
            left: 0,
            width: 16,
            height: 16,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.7)",
            backgroundColor: c("rarity-legendary"),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check size={10} strokeWidth={3.5} color="#0A120E" />
        </View>
      )}
      <View
        style={{
          marginTop: 3,
          width: 26,
          height: 5,
          borderRadius: 13,
          backgroundColor: "rgba(0,0,0,0.3)",
        }}
      />
    </Pressable>
  );
});
