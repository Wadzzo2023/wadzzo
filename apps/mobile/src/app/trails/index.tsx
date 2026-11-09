import { router, useLocalSearchParams } from "expo-router";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "~/components/shell/ScreenHeader";
import { TrailCard, TrailCardSkeleton } from "~/components/trails/TrailCard";
import { ArButton } from "~/components/ui/ArButton";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { Text } from "~/components/ui/Text";
import { useMyTrailsQuery, useTrailsQuery } from "~/lib/api/queries";
import { useGeolocation } from "~/lib/ar/location";
import { useSession } from "~/lib/auth/session";

type Segment = "near" | "mine";

/**
 * ── /trails ────────────────────────────────────────────────────────────────
 *
 * Port of the web app's /trails, reached from the Trails button on the map:
 * live trails near you (nearest first) and the ones you've started.
 */
export default function TrailsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const user = useSession((s) => s.user);
  const requireAuth = useSession((s) => s.requireAuth);
  const segment: Segment = params.tab === "mine" && user ? "mine" : "near";
  const { fix, status } = useGeolocation();

  const near = useTrailsQuery(fix ? { lat: fix.lat, lng: fix.lng } : null);
  const mine = useMyTrailsQuery();
  const active = segment === "near" ? near : mine;
  const waitingForFix = segment === "near" && !fix && status !== "denied" && status !== "unavailable";
  const loading = active.isLoading || waitingForFix;

  const [emptyTitle, emptyBody] =
    segment === "mine"
      ? ["No trails yet", "Start a trail and it shows up here with how far you've got."]
      : !fix
        ? ["Location is off", "Turn on location to find trails near you."]
        : ["No trails nearby", "Brands haven't put a trail within 50 km of you yet."];

  return (
    <View className="flex-1 bg-ar-bg">
      <ScreenHeader back eyebrow="Follow the stops" title="Trails" />
      <FlatList
        data={loading ? [] : (active.data ?? [])}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={
          <View className="pb-3.5">
            <SegmentedTabs
              className="mx-5"
              value={segment}
              onChange={(tab) => {
                if (tab === "mine" && !requireAuth("collect")) return;
                router.setParams({ tab: tab === "near" ? undefined : tab });
              }}
              tabs={[
                { id: "near", label: "Near you" },
                { id: "mine", label: "Mine" },
              ]}
            />
          </View>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <View className="px-5">
            <TrailCard trail={item} />
          </View>
        )}
        onRefresh={() => void active.refetch()}
        refreshing={active.isRefetching}
        ListEmptyComponent={
          loading ? (
            <View className="gap-3 px-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <TrailCardSkeleton key={i} />
              ))}
            </View>
          ) : active.isError ? (
            <View className="mx-5 flex-row items-center justify-between gap-3 rounded-ar border border-ar-danger/40 bg-ar-danger/10 px-3.5 py-2.5">
              <Text className="text-[12px] text-ar-danger">Couldn&rsquo;t load trails.</Text>
              <ArButton size="sm" variant="outline" onPress={() => void active.refetch()}>
                Retry
              </ArButton>
            </View>
          ) : (
            <View className="items-center py-14">
              <Text className="font-hud text-[13px] font-bold uppercase tracking-[1.8px] text-ar-dim">{emptyTitle}</Text>
              <Text className="mt-1.5 max-w-[17rem] text-center text-[12.5px] leading-5 text-ar-faint">{emptyBody}</Text>
            </View>
          )
        }
      />
    </View>
  );
}
