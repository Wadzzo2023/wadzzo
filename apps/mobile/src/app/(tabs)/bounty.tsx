import { router } from "expo-router";
import { MessageCircle, Search, Trophy, Wallet, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, TextInput, View } from "react-native";

import { BountyCard, BountyCardSkeleton } from "~/components/bounty/BountyCard";
import { useTabBarHeight } from "~/components/shell/BottomTabBar";
import { ScreenHeader } from "~/components/shell/ScreenHeader";
import { ArButton } from "~/components/ui/ArButton";
import { Chip } from "~/components/ui/Badges";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { Bevel, Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useBountiesQuery, useBountyAttention, useMyBountiesQuery } from "~/lib/api/queries";
import { useSession } from "~/lib/auth/session";
import { useColors } from "~/theme/theme";

type Filter = "open" | "ending" | "top";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "open", label: "Newest" },
  { id: "ending", label: "Ending soon" },
  { id: "top", label: "Top reward" },
];

/** Port of wadzzoAR's /bounty: Needs you, then Explore / Joined. */
export default function BountyScreen() {
  const tabBarHeight = useTabBarHeight();
  const { c } = useColors();
  const user = useSession((s) => s.user);
  const requireAuth = useSession((s) => s.requireAuth);
  const [segment, setSegment] = useState<"explore" | "mine">("explore");
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const explore = useBountiesQuery(filter, search, segment === "explore");
  const mine = useMyBountiesQuery();
  const { unseen } = useBountyAttention();

  const header = (
    <View>
      {unseen.length > 0 && (
        <View className="px-5 pb-4">
          <Text className="font-hud mb-2 text-[9.5px] font-semibold uppercase tracking-[2.4px] text-ar-green">Needs you</Text>
          <View className="gap-2">
            {unseen.map((item) => (
              <Pressable key={`${item.kind}-${item.bountyId}`} onPress={() => router.push({ pathname: "/bounty/[id]", params: { id: String(item.bountyId), ...(item.kind === "reply" ? { section: "chat" } : {}) } })}>
                <Glass className="flex-row items-center gap-3 rounded-ar p-3" style={{ borderRadius: 16 }}>
                  <View
                    className="h-9 w-9 items-center justify-center rounded-[11px] border"
                    style={item.kind === "won" ? { borderColor: c("rarity-legendary", 0.5), backgroundColor: c("rarity-legendary", 0.15) } : { borderColor: c("ar-green", 0.4), backgroundColor: c("ar-green", 0.1) }}
                  >
                    {item.kind === "won" ? <Trophy size={16} strokeWidth={2.3} color={c("rarity-legendary")} /> : <MessageCircle size={16} strokeWidth={2.3} color={c("ar-green-hot")} />}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[13px] font-semibold text-ar-text">{item.kind === "won" ? "You won a bounty" : "The brand replied"}</Text>
                    <Text numberOfLines={1} className="text-[11.5px] text-ar-faint">{item.title}</Text>
                  </View>
                  <View className="h-2 w-2 rounded-full bg-ar-green-hot" />
                </Glass>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <SegmentedTabs
        className="mx-5"
        value={segment}
        onChange={setSegment}
        tabs={[
          { id: "explore", label: "Explore" },
          { id: "mine", label: "Joined", count: user ? mine.data?.length : undefined },
        ]}
      />
      {segment === "explore" && (
        <>
          <Bevel className="mx-5 mt-3 h-11 flex-row items-center gap-2.5 rounded-ar px-3.5" style={{ borderRadius: 16 }}>
            <Search size={15} strokeWidth={2.2} color={c("ar-text-faint")} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search bounties or brands" placeholderTextColor={c("ar-text-faint")} accessibilityLabel="Search bounties" className="flex-1 text-[13px] text-ar-text" style={{ fontFamily: "Sora_400Regular" }} />
            {query ? (
              <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={8}>
                <X size={15} strokeWidth={2.4} color={c("ar-text-faint")} />
              </Pressable>
            ) : null}
          </Bevel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 20, paddingTop: 12 }}>
            {FILTERS.map((f) => (
              <Chip key={f.id} active={filter === f.id} onPress={() => setFilter(f.id)}>
                {f.label}
              </Chip>
            ))}
          </ScrollView>
        </>
      )}
      <View style={{ height: 14 }} />
    </View>
  );

  const data = segment === "explore" ? explore.items : user ? (mine.data ?? []) : [];
  const loading = segment === "explore" ? explore.isLoading : Boolean(user) && mine.isLoading;

  return (
    <View className="flex-1 bg-ar-bg">
      <ScreenHeader eyebrow="Earn from brands" title="Bounty" />
      <FlatList
        data={loading ? [] : data}
        keyExtractor={(b) => String(b.id)}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 32 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <View className="px-5">
            <BountyCard bounty={item} />
          </View>
        )}
        onEndReached={() => segment === "explore" && explore.hasNextPage && !explore.isFetchingNextPage && void explore.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          loading ? (
            <View className="gap-3 px-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <BountyCardSkeleton key={i} />
              ))}
            </View>
          ) : segment === "mine" && !user ? (
            <View className="items-center px-7 py-14">
              <Text className="font-hud text-[13px] font-bold uppercase tracking-[1.8px] text-ar-dim">Your bounties live here</Text>
              <Text className="mt-1.5 max-w-[17rem] text-center text-[12.5px] leading-5 text-ar-faint">Sign in to join bounties, send entries and track how they're doing.</Text>
              <ArButton variant="primary" icon={Wallet} className="mt-5" onPress={() => requireAuth("bounty")}>
                Connect wallet
              </ArButton>
            </View>
          ) : (
            <View className="items-center py-14">
              <Text className="font-hud text-[13px] font-bold uppercase tracking-[1.8px] text-ar-dim">
                {segment === "mine" ? "Nothing joined yet" : search ? "No matches" : "No open bounties"}
              </Text>
              <Text className="mt-1.5 max-w-[17rem] text-center text-[12.5px] leading-5 text-ar-faint">
                {segment === "mine" ? "Join a bounty from Explore and it'll show up here with your entries and results." : search ? "Nothing open matches that search." : "Brands post bounties here — check back soon."}
              </Text>
              {segment === "mine" && (
                <ArButton variant="primary" className="mt-5" onPress={() => setSegment("explore")}>
                  Explore bounties
                </ArButton>
              )}
            </View>
          )
        }
        ListFooterComponent={explore.isFetchingNextPage ? <View className="mt-3 px-5"><BountyCardSkeleton /></View> : null}
      />
    </View>
  );
}
