"use client";

import { Heart } from "lucide-react";
import { useQueryParams, useRouter } from "~/lib/navigation";
import { useEffect } from "react";

import { AnnouncementCard, AnnouncementCardSkeleton } from "~/components/events/AnnouncementCard";
import { EventCard, EventCardSkeleton } from "~/components/events/EventCard";
import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { ArButton } from "~/components/ui/ArButton";
import { Chip } from "~/components/ui/Badges";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { useAuth } from "~/lib/ar/store";
import { api } from "~/utils/api";

type Segment = "events" | "announcements";
type When = "upcoming" | "past";

const PAGE_SIZE = 12;

/**
 * ── /events ────────────────────────────────────────────────────────────────
 *
 * What brands are putting on and what they have to say, reached from the
 * calendar button on the map. Two segments rather than one mixed feed: an
 * event is something you plan around, an announcement is something you read,
 * and sorting them together (by start date? by post date?) serves neither.
 *
 * Everything's public; the Following chip is the only thing that asks you to
 * sign in, because it needs to know whose follows to use. The segment and
 * filters live in the URL so Back from an event lands where you were.
 */
export default function EventsScreen() {
  const router = useRouter();
  const { query: urlQuery, ready: urlReady } = useQueryParams();
  const user = useAuth((s) => s.user);
  const requireAuth = useAuth((s) => s.requireAuth);

  const segment: Segment = urlQuery.tab === "announcements" ? "announcements" : "events";
  const when: When = urlQuery.when === "past" ? "past" : "upcoming";
  const following = urlQuery.following === "1" && Boolean(user);

  const setQuery = (patch: Record<string, string | undefined>) => {
    const next = { ...urlQuery, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    void router.replace({ pathname: router.pathname, query: next }, undefined, { shallow: true });
  };

  const toggleFollowing = () => {
    if (!following && !requireAuth("follow")) return;
    setQuery({ following: following ? undefined : "1" });
  };

  // Signing out while "Following" is on would leave a filter nothing can satisfy.
  useEffect(() => {
    if (!user && urlQuery.following) setQuery({ following: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const events = api.events.list.useInfiniteQuery(
    { when, following, limit: PAGE_SIZE },
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      enabled: segment === "events" && urlReady,
      keepPreviousData: true,
    },
  );
  const announcements = api.events.announcements.useInfiniteQuery(
    { following, limit: PAGE_SIZE },
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      enabled: segment === "announcements" && urlReady,
      keepPreviousData: true,
    },
  );

  const eventItems = events.data?.pages.flatMap((p) => p.items) ?? [];
  const postItems = announcements.data?.pages.flatMap((p) => p.items) ?? [];
  const active = segment === "events" ? events : announcements;
  const count = segment === "events" ? eventItems.length : postItems.length;

  return (
    <AppShell tabs={false}>
      <div className="flex h-full flex-col">
        <ScreenHeader back eyebrow="From brands" title="Events" />

        <div className="ar-scroll flex-1 pb-6">
          <SegmentedTabs
            layoutId="events-segments"
            value={segment}
            onChange={(tab) => setQuery({ tab: tab === "events" ? undefined : tab })}
            className="mx-5"
            tabs={[
              { id: "events", label: "Events" },
              { id: "announcements", label: "News" },
            ]}
          />

          <div className="ar-scroll-x mt-3 flex gap-1.5 px-5">
            {segment === "events" && (
              <>
                <Chip active={when === "upcoming"} onClick={() => setQuery({ when: undefined })}>
                  Upcoming
                </Chip>
                <Chip active={when === "past"} onClick={() => setQuery({ when: "past" })}>
                  Past
                </Chip>
                <span className="mx-1 w-px shrink-0 self-stretch bg-ar-line" />
              </>
            )}
            <Chip active={following} onClick={toggleFollowing}>
              <Heart size={11} strokeWidth={2.6} className={following ? "fill-current" : undefined} />
              Following
            </Chip>
          </div>

          <div className="mt-3.5 space-y-3 px-5">
            {active.isLoading &&
              Array.from({ length: 3 }).map((_, i) =>
                segment === "events" ? <EventCardSkeleton key={i} /> : <AnnouncementCardSkeleton key={i} />,
              )}

            {segment === "events"
              ? eventItems.map((e) => <EventCard key={e.id} event={e} />)
              : postItems.map((a) => <AnnouncementCard key={a.id} announcement={a} />)}

            {active.isError && (
              <div className="flex items-center justify-between gap-3 rounded-ar border border-ar-danger/40 bg-ar-danger/10 px-3.5 py-2.5">
                <p className="text-[12px] text-ar-danger">Couldn&rsquo;t load {segment === "events" ? "events" : "news"}.</p>
                <button
                  onClick={() => void active.refetch()}
                  className="font-hud text-[11px] font-semibold uppercase tracking-[0.1em] text-ar-text"
                >
                  Retry
                </button>
              </div>
            )}

            {!active.isLoading && !active.isError && count === 0 && (
              <Empty segment={segment} when={when} following={following} />
            )}

            {active.hasNextPage && (
              <div className="flex justify-center pt-2">
                <ArButton
                  variant="outline"
                  busy={active.isFetchingNextPage}
                  onClick={() => void active.fetchNextPage()}
                >
                  Show more
                </ArButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Empty({ segment, when, following }: { segment: Segment; when: When; following: boolean }) {
  const [title, body] =
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
    <div className="py-14 text-center">
      <p className="font-hud text-[13px] font-bold uppercase tracking-[0.14em] text-ar-dim">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[12.5px] leading-relaxed text-ar-faint">{body}</p>
    </div>
  );
}
