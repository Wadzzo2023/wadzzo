import { Repeat2, Search, ShoppingBag, Sparkles, X } from "lucide-react-native";
import { useDeferredValue, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from "react-native";

import { MarketCard } from "~/components/market/MarketCard";
import { useTabBarHeight } from "~/components/shell/BottomTabBar";
import { ScreenHeader } from "~/components/shell/ScreenHeader";
import { ArButton } from "~/components/ui/ArButton";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { Skeleton } from "~/components/ui/Skeleton";
import { Bevel } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useMarketListings } from "~/lib/api/queries";
import { openMarketplace } from "~/lib/market";
import { useColors } from "~/theme/theme";

type Kind = "all" | "drops" | "resale";

/**
 * ── Marketplace tab ────────────────────────────────────────────────────────
 *
 * Port of the AR web app's /marketplace: creator drops and fan resales, searchable, newest first.
 * Read-only — every card's "Go to Marketplace" opens the item in the marketplace web app, which
 * has the wallet and checkout.
 */
export default function MarketplaceScreen() {
  const { c } = useColors();
  const tabBarHeight = useTabBarHeight();
  const [kind, setKind] = useState<Kind>("all");
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query.trim());
  const listings = useMarketListings(kind, search);

  // Two cards per row; an odd last card keeps its half width.
  const rows: (typeof listings.items)[] = [];
  for (let i = 0; i < listings.items.length; i += 2) rows.push(listings.items.slice(i, i + 2));

  return (
    <View className="flex-1 bg-ar-bg">
      <ScreenHeader eyebrow="Buy & collect" title="Marketplace" />
      <View className="px-5">
        <Bevel className="h-11 flex-row items-center gap-2.5 rounded-ar px-3.5" style={{ borderRadius: 16 }}>
          <Search size={15} strokeWidth={2.2} color={c("ar-text-faint")} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search items or creators"
            placeholderTextColor={c("ar-text-faint")}
            accessibilityLabel="Search the marketplace"
            className="flex-1 text-[13px] text-ar-text"
            style={{ fontFamily: "Sora_400Regular" }}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={8}>
              <X size={15} strokeWidth={2.4} color={c("ar-text-faint")} />
            </Pressable>
          ) : null}
        </Bevel>
      </View>
      <SegmentedTabs
        className="mx-5 mt-3"
        value={kind}
        onChange={setKind}
        tabs={[
          { id: "all", label: "All", icon: ShoppingBag },
          { id: "drops", label: "Drops", icon: Sparkles },
          { id: "resale", label: "Resale", icon: Repeat2 },
        ]}
      />
      <FlatList
        data={listings.isPending ? [] : rows}
        keyExtractor={(row) => row.map((l) => l.id).join("-")}
        contentContainerStyle={{ gap: 12, paddingHorizontal: 20, paddingTop: 14, paddingBottom: tabBarHeight + 32 }}
        renderItem={({ item: row }) => (
          <View className="flex-row gap-3">
            {row.map((l) => (
              <MarketCard key={l.id} listing={l} />
            ))}
            {row.length === 1 && <View className="flex-1" />}
          </View>
        )}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (listings.hasNextPage && !listings.isFetchingNextPage) void listings.fetchNextPage();
        }}
        ListEmptyComponent={
          listings.isPending ? (
            <View className="gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <View key={i} className="flex-row gap-3">
                  <Skeleton className="flex-1 rounded-ar" style={{ aspectRatio: 0.75, borderRadius: 16 }} />
                  <Skeleton className="flex-1 rounded-ar" style={{ aspectRatio: 0.75, borderRadius: 16 }} />
                </View>
              ))}
            </View>
          ) : listings.isError ? (
            <View className="items-center py-16">
              <Text className="font-hud text-[13px] font-bold uppercase tracking-[1.8px] text-ar-dim">Couldn&apos;t load the marketplace</Text>
              <ArButton size="sm" className="mt-3" onPress={() => void listings.refetch()}>
                Try again
              </ArButton>
            </View>
          ) : (
            <View className="items-center py-16">
              <Text className="font-hud text-[13px] font-bold uppercase tracking-[1.8px] text-ar-dim">Nothing here yet</Text>
              <Text className="mt-1.5 max-w-[16rem] text-center text-[12.5px] leading-5 text-ar-faint">
                {search ? "Nothing matches that search." : "Try another filter, or check back soon for new drops."}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          listings.isFetchingNextPage ? (
            <ActivityIndicator color={c("ar-green-hot")} style={{ marginTop: 8 }} />
          ) : listings.items.length > 0 && !listings.hasNextPage ? (
            <Pressable onPress={() => openMarketplace()} accessibilityRole="link" className="mt-3 items-center">
              <Text className="font-hud text-[11px] font-semibold uppercase tracking-[1.5px] text-ar-green">Open the full marketplace →</Text>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}
