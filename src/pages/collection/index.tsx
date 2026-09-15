import { ArrowUpDown, Search, Sparkles, X } from "lucide-react";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";

import { HoloCard } from "~/components/cards/HoloCard";
import { CardSkeleton, StatRowSkeleton } from "~/components/ui/Skeleton";
import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { ArLinkButton } from "~/components/ui/ArButton";
import { Chip, StatBlock } from "~/components/ui/Badges";
import { RARITY_META, RARITY_ORDER } from "~/lib/ar/rarity";
import { useAuth } from "~/lib/ar/store";
import type { Rarity } from "~/lib/ar/types";
import { useDragScroll } from "~/lib/ar/useDragScroll";
import { usePinsQuery } from "~/lib/ar/usePins";
import { cn } from "~/lib/utils";

type Sort = "newest" | "rarest" | "brand";

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
  const signedIn = useAuth((s) => Boolean(s.user));
  const { pins, isLoading: pinsLoading } = usePinsQuery();

  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState<Rarity | "all">("all");
  const [sort, setSort] = useState<Sort>("newest");
  const rarityRailRef = useDragScroll<HTMLDivElement>();

  const collected = useMemo(
    () => (signedIn ? pins.filter((p) => p.collected) : []),
    [pins, signedIn],
  );

  const stats = useMemo(() => {
    const brands = new Set(collected.map((p) => p.brandId));
    const best = collected.reduce<Rarity>((acc, p) => {
      const r = p.rarity;
      return RARITY_ORDER.indexOf(r) > RARITY_ORDER.indexOf(acc) ? r : acc;
    }, "common");
    return { total: collected.length, brands: brands.size, best };
  }, [collected]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = collected.filter((p) => {
      if (rarity !== "all" && p.rarity !== rarity) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.brandName.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });

    return filtered.sort((a, b) => {
      if (sort === "rarest") {
        return RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity);
      }
      if (sort === "brand") return a.brandName.localeCompare(b.brandName);
      return (
        new Date(b.collectedAt ?? 0).getTime() -
        new Date(a.collectedAt ?? 0).getTime()
      );
    });
  }, [collected, query, rarity, sort]);

  // Counts per rarity drive the filter row, so a tier you own none of can be
  // dimmed instead of leading to an empty grid.
  const counts = useMemo(() => {
    const m = new Map<Rarity, number>();
    collected.forEach((p) => {
      const r = p.rarity;
      m.set(r, (m.get(r) ?? 0) + 1);
    });
    return m;
  }, [collected]);

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <ScreenHeader
          eyebrow="Your binder"
          title="Collection"
          trailing={
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
          }
        />

        {/* ── Stats ────────────────────────────────────────────────── */}
        {pinsLoading ? (
          <div className="mx-5">
            <StatRowSkeleton count={3} />
          </div>
        ) : (
          <div className="mx-5 flex items-center justify-around rounded-ar border border-ar-line bg-white/[0.03] py-3">
            <StatBlock label="Cards" value={stats.total} accent />
            <span className="h-8 w-px bg-ar-line" />
            <StatBlock label="Brands" value={stats.brands} />
            <span className="h-8 w-px bg-ar-line" />
            <StatBlock
              label="Best pull"
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
              placeholder="Search your cards"
              aria-label="Search your collection"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ar-text outline-none placeholder:text-ar-faint"
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
            All {collected.length > 0 && `· ${collected.length}`}
          </Chip>
          {RARITY_ORDER.map((r) => {
            const n = counts.get(r) ?? 0;
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
          {pinsLoading ? (
            <div className="grid grid-cols-2 gap-3.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : shown.length > 0 ? (
            <div className="grid grid-cols-2 gap-3.5">
              {shown.map((pin, i) => (
                <HoloCard
                  key={pin.id}
                  pin={pin}
                  priority={i < 4}
                  onClick={() => void router.push(`/collection/${pin.id}`)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              signedIn={signedIn}
              filtered={collected.length > 0}
              onClear={() => {
                setQuery("");
                setRarity("all");
              }}
            />
          )}
        </div>
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
          Nothing in your binder fits that search.
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
        {signedIn ? "Nothing collected yet" : "Your binder is waiting"}
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
