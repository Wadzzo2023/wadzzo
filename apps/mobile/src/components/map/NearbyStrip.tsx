import { Image } from "expo-image";
import { Zap } from "lucide-react-native";
import { memo, useEffect, useRef } from "react";
import { FlatList, Pressable, View } from "react-native";

import { Glass } from "~/components/ui/surfaces";
import { NearbyCardSkeleton } from "~/components/ui/Skeleton";
import { Text } from "~/components/ui/Text";
import { AR_CAPTURE_RADIUS, formatDistance } from "~/lib/ar/geo";
import { pinStatus } from "~/lib/ar/rarity";
import type { ArPin } from "~/lib/ar/types";
import { useColors } from "~/theme/theme";

export interface NearbyPin {
  pin: ArPin;
  distance: number;
}

const CARD_W = 168;
const GAP = 10;

/**
 * Port of the web's NearbyStrip: the nearest drops as a thumb rail — the
 * screen's real navigation. Keeps the selected card in view when selection
 * comes from the map.
 */
// Memoized: the map screen re-renders on every GPS/compass update, and each
// re-render handed the FlatList a new renderItem, re-rendering every card.
export const NearbyStrip = memo(function NearbyStrip({ items, selectedId, onSelect, loading = false }: { items: NearbyPin[]; selectedId: string | null; onSelect: (id: string) => void; loading?: boolean }) {
  const { c, rarity: rc } = useColors();
  const list = useRef<FlatList<NearbyPin>>(null);

  useEffect(() => {
    if (!selectedId) return;
    const index = items.findIndex((i) => i.pin.id === selectedId);
    if (index >= 0) list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
  }, [selectedId, items]);

  if (loading && items.length === 0) {
    return (
      <View className="flex-row gap-2.5 px-4 pb-1" accessibilityLabel="Loading nearby drops">
        {Array.from({ length: 3 }).map((_, i) => (
          <NearbyCardSkeleton key={i} />
        ))}
      </View>
    );
  }
  if (items.length === 0) {
    return (
      <Glass className="mx-4 rounded-ar px-4 py-3" style={{ borderRadius: 16 }}>
        <Text className="font-hud text-center text-[11px] font-semibold uppercase tracking-[1.6px] text-ar-dim">Nothing nearby</Text>
        <Text className="mt-1 text-center text-[11.5px] text-ar-faint">Try widening the filter, or head toward the city centre.</Text>
      </Glass>
    );
  }

  return (
    <FlatList
      ref={list}
      horizontal
      data={items}
      keyExtractor={(i) => i.pin.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: GAP, paddingBottom: 4 }}
      getItemLayout={(_, index) => ({ length: CARD_W + GAP, offset: 16 + (CARD_W + GAP) * index, index })}
      onScrollToIndexFailed={() => undefined}
      renderItem={({ item: { pin, distance } }) => {
        const status = pinStatus(pin);
        const inRange = distance <= AR_CAPTURE_RADIUS;
        const active = pin.id === selectedId;
        const hot = inRange && status === "collectible";
        return (
          <Pressable onPress={() => onSelect(pin.id)} accessibilityRole="button" accessibilityLabel={`${pin.title}, ${formatDistance(distance)}`}>
            <Glass
              style={{
                width: CARD_W,
                borderRadius: 16,
                padding: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                ...(active ? { borderColor: c("ar-green", 0.6), borderWidth: 2 } : {}),
              }}
            >
              <View style={{ width: 34, height: 46, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: rc(pin.rarity, 0.55) }}>
                <Image source={{ uri: pin.imageUrl }} style={{ width: "100%", height: "100%", opacity: status !== "collectible" ? 0.55 : 1 }} contentFit="cover" />
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-hud text-[11.5px] font-bold leading-4 text-ar-text">{pin.title}</Text>
                <Text numberOfLines={1} className="text-[10px] text-ar-faint">{pin.brandName}</Text>
                <View className="mt-1 flex-row items-center gap-1">
                  {pin.autoCollect && status === "collectible" && <Zap size={9} strokeWidth={3} color={c("ar-green-hot")} />}
                  <Text className="font-hud text-[10px] font-bold" style={{ color: hot ? c("ar-green-hot") : c("ar-text-dim"), fontVariant: ["tabular-nums"] }}>
                    {Number.isFinite(distance) ? formatDistance(distance) : "—"}
                  </Text>
                  {hot && <Text className="font-hud text-[8px] uppercase tracking-[1.1px] text-ar-green-hot">· in range</Text>}
                </View>
              </View>
              <View style={{ position: "absolute", top: 8, bottom: 8, right: 4, width: 2.5, borderRadius: 2, backgroundColor: rc(pin.rarity), opacity: 0.8 }} />
            </Glass>
          </Pressable>
        );
      }}
    />
  );
});
