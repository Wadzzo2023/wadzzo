"use client";

import { Repeat2, Search, ShoppingBag, Sparkles, X } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { MarketCard } from "~/components/market/MarketCard";
import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { ArButton } from "~/components/ui/ArButton";
import { Skeleton } from "~/components/ui/Skeleton";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { marketplaceUrl } from "~/lib/market";
import { api } from "~/utils/api";

type Kind = "all" | "drops" | "resale";

/**
 * ── /marketplace ───────────────────────────────────────────────────────────
 *
 * The fan marketplace, to browse from AR: creator drops and fan resales, searchable, newest
 * first. Read-only here — every card's "Go to Marketplace" opens the item in the marketplace
 * app, which has the wallet and checkout.
 */
export default function MarketplaceScreen() {
  const [kind, setKind] = useState<Kind>("all");
  const [query, setQuery] = useState("");
  // Typing shouldn't fire a request per keystroke at full priority.
  const search = useDeferredValue(query.trim()) || undefined;

  const listings = api.market.listings.useInfiniteQuery(
    { kind, search, sort: "new", limit: 24 },
    { getNextPageParam: (page) => page.nextCursor ?? undefined, staleTime: 60_000 },
  );
  const items = listings.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <ScreenHeader eyebrow="Buy & collect" title="Marketplace" />

        {/* ── Search ───────────────────────────────────────────────── */}
        <div className="px-5">
          <div className="ar-bevel rounded-ar flex h-11 items-center gap-2.5 px-3.5">
            <Search size={15} strokeWidth={2.2} className="text-ar-faint shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items or creators"
              aria-label="Search the marketplace"
              className="text-ar-text placeholder:text-ar-faint min-w-0 flex-1 bg-transparent text-[13px] outline-hidden"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="text-ar-faint hover:text-ar-text shrink-0"
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>

        <SegmentedTabs
          layoutId="market-kind-tabs"
          value={kind}
          onChange={setKind}
          className="mx-5 mt-3"
          tabs={[
            { id: "all", label: "All", icon: ShoppingBag },
            { id: "drops", label: "Drops", icon: Sparkles },
            { id: "resale", label: "Resale", icon: Repeat2 },
          ]}
        />

        {/* ── Grid ─────────────────────────────────────────────────── */}
        <div className="ar-scroll mt-3.5 flex-1 px-5 pb-6">
          <div className="grid grid-cols-2 gap-3">
            {listings.isPending &&
              Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] w-full" rounded="rounded-ar" />
              ))}
            {items.map((l) => (
              <MarketCard key={l.id} listing={l} />
            ))}
          </div>

          {listings.isError && (
            <div className="py-16 text-center">
              <p className="font-hud text-ar-dim text-[13px] font-bold tracking-[0.14em] uppercase">
                Couldn&apos;t load the marketplace
              </p>
              <ArButton size="sm" className="mt-3" onClick={() => void listings.refetch()}>
                Try again
              </ArButton>
            </div>
          )}

          {!listings.isPending && !listings.isError && items.length === 0 && (
            <div className="py-16 text-center">
              <p className="font-hud text-ar-dim text-[13px] font-bold tracking-[0.14em] uppercase">
                Nothing here yet
              </p>
              <p className="text-ar-faint mx-auto mt-1.5 max-w-[16rem] text-[12.5px] leading-relaxed">
                {search
                  ? "Nothing matches that search."
                  : "Try another filter, or check back soon for new drops."}
              </p>
            </div>
          )}

          {listings.hasNextPage && (
            <ArButton
              block
              variant="outline"
              className="mt-4"
              busy={listings.isFetchingNextPage}
              onClick={() => void listings.fetchNextPage()}
            >
              Load more
            </ArButton>
          )}

          {items.length > 0 && (
            <a
              href={marketplaceUrl}
              className="font-hud text-ar-green mt-5 block text-center text-[11px] font-semibold tracking-[0.14em] uppercase hover:underline"
            >
              Open the full marketplace →
            </a>
          )}
        </div>
      </div>
    </AppShell>
  );
}
