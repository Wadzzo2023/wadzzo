import { router, useLocalSearchParams } from "expo-router";
import { Heart } from "lucide-react-native";
import { useEffect } from "react";
import { FlatList, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnnouncementCard, AnnouncementCardSkeleton } from "~/components/events/AnnouncementCard";
import { EventCard, EventCardSkeleton } from "~/components/events/EventCard";
import { ScreenHeader } from "~/components/shell/ScreenHeader";
import { ArButton } from "~/components/ui/ArButton";
import { Chip } from "~/components/ui/Badges";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { Text } from "~/components/ui/Text";
import { useAnnouncementsQuery, useEventsQuery } from "~/lib/api/queries";
import type { ArAnnouncement, ArEventCard } from "~/lib/api/types";
import { useSession } from "~/lib/auth/session";
import { useColors } from "~/theme/theme";

type Segment = "events" | "announcements";
type When = "upcoming" | "past";

/**
 * ── /events ────────────────────────────────────────────────────────────────
 *
 * Port of wadzzoAR's /events, reached from the calendar button on the map:
 * Events (Upcoming / Past) and News, with a Following filter. Segment and
 * filters live in the route params so Back from an event lands where you were.
 */
export default function EventsScreen() {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string; when?: string; following?: string }>();
  const user = useSession((s) => s.user);
  const requireAuth = useSession((s) => s.requireAuth);

  const segment: Segment = params.tab === "announcements" ? "announcements" : "events";
  const when: When = params.when === "past" ? "past" : "upcoming";
  const following = params.following === "1" && Boolean(user);

  const setParams = (patch: { tab?: string; when?: string; following?: string }) => router.setParams(patch);

  // Signing out while Following is on would leave a filter nothing can satisfy.
  useEffect(() => {
    if (!user && params.following) setParams({ following: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const events = useEventsQuery(when, following, segment === "events");
  const posts = useAnnouncementsQuery(following, segment === "announcements");
  const active = segment === "events" ? events : posts;

  const header = (
    <View>
      <SegmentedTabs
        className="mx-5"
        value={segment}
        onChange={(tab) => setParams({ tab: tab === "events" ? undefined : tab })}
        tabs={[
          { id: "events", label: "Events" },
          { id: "announcements", label: "News" },
        ]}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 20, paddingTop: 12, alignItems: "center" }}>
        {segment === "events" && (
          <>
            <Chip active={when === "upcoming"} onPress={() => setParams({ when: undefined })}>Upcoming</Chip>
            <Chip active={when === "past"} onPress={() => setParams({ when: "past" })}>Past</Chip>
            <View style={{ width: 1, height: 20, marginHorizontal: 4, backgroundColor: c("ar-line") }} />
          </>
        )}
        <Chip
          active={following}
          onPress={() => {
            if (!following && !requireAuth("follow")) return;
            setParams({ following: following ? undefined : "1" });
          }}
        >
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <Heart size={11} strokeWidth={2.6} color={following ? c("ar-green-hot") : c("ar-text-dim")} fill={following ? c("ar-green-hot") : "none"} />
            <Text className="font-hud text-[11px] font-semibold uppercase tracking-[1.1px]" style={{ color: following ? c("ar-green-hot") : c("ar-text-dim") }}>
              Following
            </Text>
          </View>
        </Chip>
      </ScrollView>
      <View style={{ height: 14 }} />
    </View>
  );

  const [emptyTitle, emptyBody] =
    segment === "announcements"
      ? following
        ? ["Nothing from your brands", "Brands you follow haven't posted any news yet."]
        : ["No news yet", "When brands post announcements, they'll show up here."]
      : when === "past"
        ? ["No past events", following ? "Brands you follow haven't held any events yet." : "Nothing has happened here yet."]
        : following
          ? ["Nothing coming up", "Brands you follow have no upcoming events. Turn off Following to see everything."]
          : ["Nothing coming up", "Brands post events here — check back soon."];

  return (
    <View className="flex-1 bg-ar-bg">
      <ScreenHeader back eyebrow="From brands" title="Events" />
      <FlatList<ArEventCard | ArAnnouncement>
        data={active.isLoading ? [] : active.items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <View className="px-5">
            {segment === "events" ? <EventCard event={item as ArEventCard} /> : <AnnouncementCard announcement={item as ArAnnouncement} />}
          </View>
        )}
        onEndReached={() => active.hasNextPage && !active.isFetchingNextPage && void active.fetchNextPage()}
        onEndReachedThreshold={0.5}
        onRefresh={() => void active.refetch()}
        refreshing={active.isRefetching && !active.isFetchingNextPage}
        ListEmptyComponent={
          active.isLoading ? (
            <View className="gap-3 px-5">
              {Array.from({ length: 3 }).map((_, i) => (segment === "events" ? <EventCardSkeleton key={i} /> : <AnnouncementCardSkeleton key={i} />))}
            </View>
          ) : active.isError ? (
            <View className="mx-5 flex-row items-center justify-between gap-3 rounded-ar border border-ar-danger/40 bg-ar-danger/10 px-3.5 py-2.5">
              <Text className="text-[12px] text-ar-danger">Couldn&rsquo;t load {segment === "events" ? "events" : "news"}.</Text>
              <ArButton size="sm" variant="outline" onPress={() => void active.refetch()}>Retry</ArButton>
            </View>
          ) : (
            <View className="items-center py-14">
              <Text className="font-hud text-[13px] font-bold uppercase tracking-[1.8px] text-ar-dim">{emptyTitle}</Text>
              <Text className="mt-1.5 max-w-[17rem] text-center text-[12.5px] leading-5 text-ar-faint">{emptyBody}</Text>
            </View>
          )
        }
        ListFooterComponent={
          active.isFetchingNextPage ? (
            <View className="mt-3 px-5">{segment === "events" ? <EventCardSkeleton /> : <AnnouncementCardSkeleton />}</View>
          ) : null
        }
      />
    </View>
  );
}
