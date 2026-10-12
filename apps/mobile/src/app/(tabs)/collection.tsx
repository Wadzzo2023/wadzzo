import { router, useLocalSearchParams } from "expo-router";
import { ArrowUpDown, Frame, Search, Sparkles, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, TextInput, View } from "react-native";

import { HoloCard } from "~/components/cards/HoloCard";
import { MuralCollection } from "~/components/murals/MuralCollection";
import { useTabBarHeight } from "~/components/shell/BottomTabBar";
import { ScreenHeader } from "~/components/shell/ScreenHeader";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { Chip, StatBlock } from "~/components/ui/Badges";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { CardSkeleton, StatRowSkeleton } from "~/components/ui/Skeleton";
import { Bevel, Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useCollectedQuery } from "~/lib/api/queries";
import { RARITY_META, RARITY_ORDER } from "~/lib/ar/rarity";
import type { ArPin, Rarity } from "~/lib/ar/types";
import { useSession } from "~/lib/auth/session";
import { useColors } from "~/theme/theme";

const PAGE_SIZE = 24;

/**
 * The next page lands below the fold, so (as on the web) its placeholders go
 * in the same grid while it loads — the cards already on screen stay put.
 */
type NextSlot = { id: string; placeholder: true };
const nextSlots = (n: number): NextSlot[] => Array.from({ length: n }, (_, i) => ({ id: `next-${i}`, placeholder: true }));
type Sort = "newest" | "rarest" | "brand";
const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "rarest", label: "Rarest" },
  { id: "brand", label: "Brand" },
];

/** Port of wadzzoAR's /collection — "Your collection". */
export default function CollectionScreen() {
  const tabBarHeight = useTabBarHeight();
  const { c, rarity: rc } = useColors();
  const signedIn = useSession((s) => Boolean(s.user));
  // Drops | Murals — `?tab=murals` so the camera's coin pill lands on the right one.
  const params = useLocalSearchParams<{ tab?: string }>();
  const tab: "drops" | "murals" = params.tab === "murals" ? "murals" : "drops";
  const setTab = (t: "drops" | "murals") => router.setParams({ tab: t });
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [rarity, setRarity] = useState<Rarity | "all">("all");
  const [sort, setSort] = useState<Sort>("newest");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const collection = useCollectedQuery({ query: debounced, sort, rarity, pageSize: PAGE_SIZE });
  const shown = collection.pins;
  const facets = collection.facets;
  const stats = { total: facets?.total ?? 0, brands: facets?.brands ?? 0, best: facets?.best ?? ("common" as Rarity) };
  const remaining = collection.total - shown.length;
  const loading = signedIn && collection.isLoading;

  const header = (
    <View>
      {loading ? (
        <View className="mx-5">
          <StatRowSkeleton count={3} />
        </View>
      ) : (
        <View className="mx-5 flex-row items-center justify-around rounded-ar border border-ar-line bg-ar-text/5 py-3">
          <StatBlock label="Collectibles" value={stats.total} accent />
          <View className="h-8 w-px bg-ar-line" />
          <StatBlock label="Brands" value={stats.brands} />
          <View className="h-8 w-px bg-ar-line" />
          <StatBlock
            label="Best find"
            value={
              stats.total > 0 ? (
                <Text className="font-hud text-[19px] font-bold" style={{ color: rc(stats.best) }}>
                  {RARITY_META[stats.best].short}
                </Text>
              ) : (
                "—"
              )
            }
          />
        </View>
      )}

      <Bevel className="mx-5 mt-3 h-11 flex-row items-center gap-2.5 rounded-ar px-3.5" style={{ borderRadius: 16 }}>
        <Search size={15} strokeWidth={2.2} color={c("ar-text-faint")} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search your collectibles"
          placeholderTextColor={c("ar-text-faint")}
          accessibilityLabel="Search your collection"
          className="flex-1 text-[13px] text-ar-text"
          style={{ fontFamily: "Sora_400Regular" }}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={8}>
            <X size={15} strokeWidth={2.4} color={c("ar-text-faint")} />
          </Pressable>
        ) : null}
      </Bevel>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Chip active={rarity === "all"} onPress={() => setRarity("all")}>
          {`All${stats.total > 0 ? ` · ${stats.total}` : ""}`}
        </Chip>
        {RARITY_ORDER.map((r) => {
          const n = facets?.counts[r] ?? 0;
          return (
            <Chip key={r} active={rarity === r} onPress={() => setRarity(r)} className={n === 0 ? "opacity-40" : undefined}>
              <View className="flex-row items-center gap-1.5">
                <Text className="font-hud text-[11px] font-bold" style={{ color: rc(r) }}>
                  {RARITY_META[r].short}
                </Text>
                <Text className="font-hud text-[11px] font-semibold uppercase tracking-[1.1px]" style={{ color: rarity === r ? c("ar-green-hot") : c("ar-text-dim") }}>
                  {`${RARITY_META[r].label}${n > 0 ? ` · ${n}` : ""}`}
                </Text>
              </View>
            </Chip>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View className="flex-1 bg-ar-bg">
      <ScreenHeader
        eyebrow="Your collection"
        title="Collection"
        trailing={
          tab === "drops" && (
          <Pressable onPress={() => setSort((s) => SORTS[(SORTS.findIndex((x) => x.id === s) + 1) % SORTS.length]!.id)} accessibilityRole="button" accessibilityLabel={`Sort: ${SORTS.find((s) => s.id === sort)?.label}`}>
            <Glass className="h-9 flex-row items-center gap-1.5 rounded-full px-3" style={{ borderRadius: 18 }}>
              <ArrowUpDown size={13} strokeWidth={2.4} color={c("ar-text-dim")} />
              <Text className="font-hud text-[10px] font-semibold uppercase tracking-[1.2px] text-ar-dim">{SORTS.find((s) => s.id === sort)?.label}</Text>
            </Glass>
          </Pressable>
          )
        }
      />
      <SegmentedTabs
        tabs={[
          { id: "drops", label: "Drops", icon: Sparkles },
          { id: "murals", label: "Murals", icon: Frame },
        ]}
        value={tab}
        onChange={setTab}
        className="mx-5 mb-3"
      />
      {tab === "murals" ? (
        <MuralCollection header={<View />} />
      ) : (
      <FlatList<ArPin | NextSlot>
        data={loading ? [] : collection.isFetchingNextPage ? [...shown, ...nextSlots(Math.min(remaining, PAGE_SIZE))] : shown}
        keyExtractor={(p) => p.id}
        numColumns={2}
        ListHeaderComponent={header}
        columnWrapperStyle={{ gap: 14, paddingHorizontal: 20 }}
        contentContainerStyle={{ gap: 14, paddingBottom: tabBarHeight + 40 }}
        renderItem={({ item }) => (
          <View style={{ flex: 1, maxWidth: "50%" }}>
            {"placeholder" in item ? <CardSkeleton /> : <HoloCard pin={item} oneFace onPress={() => router.push(`/collection/${item.id}`)} />}
          </View>
        )}
        onEndReachedThreshold={0.4}
        // Each card stacks blend-mode foil layers; keep only ~3 screens of
        // them mounted instead of the default ~21 so big collections stay light.
        windowSize={7}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        removeClippedSubviews
        ListEmptyComponent={
          loading ? (
            <View className="flex-row flex-wrap gap-3.5 px-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <View key={i} style={{ width: "47.5%" }}>
                  <CardSkeleton />
                </View>
              ))}
            </View>
          ) : (
            <EmptyState signedIn={signedIn} filtered={stats.total > 0} onClear={() => { setQuery(""); setRarity("all"); }} />
          )
        }
        ListFooterComponent={
          remaining > 0 && !collection.isFetchingNextPage ? (
            <View className="mt-2 items-center">
              <ArButton onPress={() => void collection.fetchNextPage()}>
                {`Show ${Math.min(remaining, PAGE_SIZE)} more · ${remaining} left`}
              </ArButton>
            </View>
          ) : null
        }
      />
      )}
    </View>
  );
}

function EmptyState({ signedIn, filtered, onClear }: { signedIn: boolean; filtered: boolean; onClear: () => void }) {
  const { c } = useColors();
  const requireAuth = useSession((s) => s.requireAuth);
  if (filtered) {
    return (
      <View className="items-center py-16">
        <Text className="font-hud text-[13px] font-bold uppercase tracking-[1.8px] text-ar-dim">No matches</Text>
        <Text className="mt-1.5 max-w-[16rem] text-center text-[12.5px] leading-5 text-ar-faint">Nothing in your collection fits that search.</Text>
        <Pressable onPress={onClear} className="mt-4">
          <Text className="font-hud text-[11px] font-semibold uppercase tracking-[1.5px] text-ar-green-hot">Clear filters</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View className="items-center py-14">
      <View className="mb-6 flex-row gap-2.5">
        {[0, 1, 2].map((i) => (
          <View key={i} className="h-[92px] w-[66px] rounded-[11px] border border-dashed border-ar-line-bright bg-ar-text/5" style={{ transform: [{ rotate: `${(i - 1) * 7}deg` }] }} />
        ))}
      </View>
      <Sparkles size={20} strokeWidth={2} color={c("ar-green-hot")} />
      <Text className="font-hud mt-3 text-[15px] font-bold uppercase tracking-[1.5px] text-ar-text">{signedIn ? "Nothing collected yet" : "Your collection is waiting"}</Text>
      <Text className="mt-2 max-w-[17rem] text-center text-[12.5px] leading-5 text-ar-faint">
        {signedIn ? "Find a pin on the map, walk to it, and capture it in AR. It lands here." : "Browse the map and see what's out there. Sign in when you find something worth keeping."}
      </Text>
      <View className="mt-5 flex-row gap-2">
        <ArLinkButton href="/map" variant="primary">
          Open the map
        </ArLinkButton>
        {!signedIn && <ArButton onPress={() => requireAuth("collect")}>Sign in</ArButton>}
      </View>
    </View>
  );
}
