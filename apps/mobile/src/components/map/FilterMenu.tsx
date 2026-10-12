import { ChevronDown } from "lucide-react-native";
import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { Chip } from "~/components/ui/Badges";
import { Text } from "~/components/ui/Text";
import type { PinFilterId } from "~/lib/ar/pins";
import { useColors } from "~/theme/theme";

/** Gap between the anchor chip and the dropdown below it. */
const DROP_GAP = 4;

/**
 * The map's filter rail, collapsed: only the active filter shows as a chip.
 * Tapping it drops the other filters just below; picking one (or tapping
 * anywhere else) closes it. A Modal hosts the dropdown so it isn't clipped by
 * the HUD row and still gets touches outside that row's bounds.
 */
export function FilterMenu({
  filters,
  value,
  onChange,
}: {
  filters: { id: PinFilterId; label: string }[];
  value: PinFilterId;
  onChange: (id: PinFilterId) => void;
}) {
  const { c } = useColors();
  const anchor = useRef<View>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const current = filters.find((f) => f.id === value) ?? filters[0];
  const others = filters.filter((f) => f.id !== current?.id);

  const open = () =>
    anchor.current?.measureInWindow((x, y, _w, h) => setPos({ x, y: y + h + DROP_GAP }));
  const close = () => setPos(null);

  return (
    <>
      <View ref={anchor} collapsable={false}>
        <Chip active onPress={() => (pos ? close() : open())}>
          <Text className="font-hud text-[11px] font-semibold uppercase tracking-[1.1px]" style={{ color: c("ar-green-hot") }}>
            {current?.label}
          </Text>
          <ChevronDown size={13} strokeWidth={2.6} color={c("ar-green-hot")} style={{ transform: [{ rotate: pos ? "180deg" : "0deg" }] }} />
        </Chip>
      </View>

      <Modal visible={pos !== null} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close filters" />
        {pos && (
          <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(100)} style={{ position: "absolute", left: pos.x, top: pos.y, alignItems: "flex-start", gap: DROP_GAP }}>
            {others.map((f) => (
              // Solid backing: the chip's own fill is translucent, and over
              // the map a dropdown needs to read as sitting above it.
              <View key={f.id} className="rounded-full bg-ar-surface">
                <Chip
                  onPress={() => {
                    onChange(f.id);
                    close();
                  }}
                >
                  {f.label}
                </Chip>
              </View>
            ))}
          </Animated.View>
        )}
      </Modal>
    </>
  );
}
