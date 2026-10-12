"use client";

import { ArrowUpDown, Frame, Search, Sparkles, X } from "lucide-react";
import { useQueryParams, useRouter } from "~/lib/navigation";
import { useEffect, useState } from "react";

import { HoloCard } from "~/components/cards/HoloCard";
import { MuralCollection } from "~/components/murals/MuralCollection";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { CardSkeleton, StatRowSkeleton } from "~/components/ui/Skeleton";
import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { Chip, StatBlock } from "~/components/ui/Badges";
import { RARITY_META, RARITY_ORDER } from "~/lib/ar/rarity";
import { useAuth } from "~/lib/ar/store";
import type { Rarity } from "~/lib/ar/types";
import { useDragScroll } from "~/lib/ar/useDragScroll";
import { useCollectedPinsQuery } from "~/lib/ar/usePins";
import { cn } from "~/lib/utils";

/** Cards mounted per page — same budget as the brand grid. */
const PAGE_SIZE = 24;

type Sort = "newest" | "rarest" | "brand";
type CollectionTab = "drops" | "murals";

const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "rarest", label: "Rarest" },
  { id: "brand", label: "Brand" },
];

/**
 * ── /collection ────────────────────────────────────────────────────────────
 *
 * The binder. Every card the viewer holds, as a two-up grid of foils.
 *
 * Two-up rather than three: at three columns a card is ~110px wide on a
 * phone, the foil stops reading, and the title truncates to two words. The
 * whole point of the screen is that the cards look like something worth
 * having, and that needs the width.
 *
 * Signed out this shows the empty state rather than a login wall — a
 * prospective collector should be able to see what a collection *is* before
 * being asked to make one.
 */
export default function CollectionScreen() {
  const router = useRouter();
  const { query: urlQuery, ready: urlReady } = useQueryParams();
  const signedIn = useAuth((s) => Boolean(s.user));
  // Drops | Murals — in the URL so the camera's coin pill and back-navigation land on the right one.
  const tab: CollectionTab = urlQuery.tab === "murals" ? "murals" : "drops";
  const setTab = (t: CollectionTab) =>
    void router.replace(
      { pathname: router.pathname, query: t === "murals" ? { tab: t } : {} },
      undefined,
      { shallow: true },
    );
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState<Rarity | "all">("all");
  const [sort, setSort] = useState<Sort>("newest");
  const rarityRailRef = useDragScroll<HTMLDivElement>();

  // Search is a server query now, so every keystroke would otherwise be a
  // request. A short debounce keeps typing to one round trip per pause; the
  // input itself stays uncontrolled-feeling because `query` updates instantly
  // and only the *fetch* waits.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const collection = useCollectedPinsQuery({
    enabled: signedIn,
    rarity,
    query: debouncedQuery,
    sort,
    pageSize: PAGE_SIZE,
  });

  const shown = collection.pins;
  const facets = collection.facets;
  const stats = {
    total: facets?.total ?? 0,
    brands: facets?.brands ?? 0,
    best: facets?.best ?? ("common"),
  };
  const remaining = collection.total - shown.length;
  // Signed out there is nothing to fetch, so the query never runs and its
  // `isLoading` would otherwise pin the screen on skeletons forever.
  const loading = signedIn && collection.isLoading;

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <ScreenHeader
          eyebrow="Your collection"
          title="Collection"
          trailing={
            tab === "drops" && (
              <button
                onClick={() =>
                  setSort(
                    (s) =>
                      SORTS[
                        (SORTS.findIndex((x) => x.id === s) + 1) % SORTS.length
                      ]!.id,
                  )
                }
                className="ar-glass flex h-9 items-center gap-1.5 rounded-full px-3 text-ar-dim"
              >
                <ArrowUpDown size={13} strokeWidth={2.4} />
                <span className="font-hud text-[10px] font-semibold uppercase tracking-[0.12em]">
                  {SORTS.find((s) => s.id === sort)?.label}
                </span>
              </button>
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
          layoutId="collection-tab"
          className="mx-5 mb-3"
        />

        {tab === "murals" ? (
          <MuralCollection signedIn={signedIn} />
        ) : (
          <>
            {/* ── Stats ────────────────────────────────────────────────── */}
            {loading ? (
              <div className="mx-5">
                <StatRowSkeleton count={3} />
              </div>
            ) : (
              <div className="mx-5 flex items-center justify-around rounded-ar border border-ar-line bg-white/[0.03] py-3">
                <StatBlock label="Collectibles" value={stats.total} accent />
                <span className="h-8 w-px bg-ar-line" />
                <StatBlock label="Brands" value={stats.brands} />
                <span className="h-8 w-px bg-ar-line" />
                <StatBlock
                  label="Best find"
                  value={
                    stats.total > 0 ? (
                      <span
                        style={{ color: `hsl(${RARITY_META[stats.best].hsl})` }}
                      >
                        {RARITY_META[stats.best].short}
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
              </div>
            )}

            {/* ── Search ───────────────────────────────────────────────── */}
            <div className="mx-5 mt-3">
              <div className="ar-bevel flex h-11 items-center gap-2.5 rounded-ar px-3.5">
                <Search
                  size={15}
                  strokeWidth={2.2}
                  className="shrink-0 text-ar-faint"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your collectibles"
                  aria-label="Search your collection"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-ar-text outline-hidden placeholder:text-ar-faint"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="shrink-0 text-ar-faint hover:text-ar-text"
                  >
                    <X size={15} strokeWidth={2.4} />
                  </button>
                )}
              </div>
            </div>

            {/* ── Rarity filter ────────────────────────────────────────── */}
            <div
              ref={rarityRailRef}
              className="ar-scroll-x mt-3 flex gap-1.5 px-5 pb-1"
            >
              <Chip active={rarity === "all"} onClick={() => setRarity("all")}>
                All {stats.total > 0 && `· ${stats.total}`}
              </Chip>
              {RARITY_ORDER.map((r) => {
                const n = facets?.counts[r] ?? 0;
                return (
                  <Chip
                    key={r}
                    active={rarity === r}
                    onClick={() => setRarity(r)}
                    className={cn(n === 0 && "opacity-40")}
                  >
                    <span style={{ color: `hsl(${RARITY_META[r].hsl})` }}>
                      {RARITY_META[r].short}
                    </span>
                    {RARITY_META[r].label} {n > 0 && `· ${n}`}
                  </Chip>
                );
              })}
            </div>

            {/* ── Grid ─────────────────────────────────────────────────── */}
            <div className="ar-scroll mt-4 flex-1 px-5 pb-6">
              {/* Four placeholder foils — enough to fill the fold, so the grid
              doesn't flash the "nothing collected yet" copy at someone who
              does in fact have cards. */}
              {loading ? (
                <div className="grid grid-cols-2 gap-3.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <CardSkeleton key={i} />
                  ))}
                </div>
              ) : shown.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-3.5">
                    {shown.map((pin, i) => (
                      <HoloCard
                        key={pin.id}
                        pin={pin}
                        oneFace
                        className="tcg-card--windowed"
                        priority={i < 4}
                        onClick={() =>
                          void router.push(`/collection/${pin.id}`)
                        }
                      />
                    ))}

                    {/* The next page lands below the fold, so its placeholders go
                    in the same grid — the cards already on screen stay put. */}
                    {collection.isFetchingNextPage &&
                      Array.from({
                        length: Math.min(remaining, PAGE_SIZE),
                      }).map((_, i) => <CardSkeleton key={`next-${i}`} />)}
                  </div>

                  {remaining > 0 && !collection.isFetchingNextPage && (
                    <div className="mt-5 flex justify-center">
                      <ArButton
                        variant="outline"
                        size="md"
                        onClick={() => void collection.fetchNextPage()}
                      >
                        Show {Math.min(remaining, PAGE_SIZE)} more
                        <span className="ml-1 text-ar-faint">
                          &middot; {remaining} left
                        </span>
                      </ArButton>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  signedIn={signedIn}
                  filtered={stats.total > 0}
                  onClear={() => {
                    setQuery("");
                    setRarity("all");
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function EmptyState({
  signedIn,
  filtered,
  onClear,
}: {
  signedIn: boolean;
  filtered: boolean;
  onClear: () => void;
}) {
  if (filtered) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="font-hud text-[13px] font-bold uppercase tracking-[0.14em] text-ar-dim">
          No matches
        </p>
        <p className="mt-1.5 max-w-[16rem] text-[12.5px] leading-relaxed text-ar-faint">
          Nothing in your collection fits that search.
        </p>
        <button
          onClick={onClear}
          className="font-hud mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ar-green-hot"
        >
          Clear filters
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      {/* Three empty card slots — shows the shape of what goes here. */}
      <div className="mb-6 flex gap-2.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[92px] w-[66px] rounded-[11px] border border-dashed border-ar-line-bright bg-white/[0.02]"
            style={{ transform: `rotate(${(i - 1) * 7}deg)` }}
          />
        ))}
      </div>

      <Sparkles size={20} className="mb-3 text-ar-green-hot" strokeWidth={2} />
      <p className="font-hud text-[15px] font-bold uppercase tracking-[0.1em] text-ar-text">
        {signedIn ? "Nothing collected yet" : "Your collection is waiting"}
      </p>
      <p className="mt-2 max-w-[17rem] text-[12.5px] leading-relaxed text-ar-faint">
        {signedIn
          ? "Find a pin on the map, walk to it, and capture it in AR. It lands here."
          : "Browse the map and see what's out there. Sign in when you find something worth keeping."}
      </p>

      <ArLinkButton href="/map" variant="primary" size="md" className="mt-5">
        Open the map
      </ArLinkButton>
    </div>
  );
}
