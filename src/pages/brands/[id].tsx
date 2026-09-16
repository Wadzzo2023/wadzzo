import { motion } from "framer-motion";
import { BadgeCheck, ChevronLeft, Share2 } from "lucide-react";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";

import { HoloCard } from "~/components/cards/HoloCard";
import { AppShell } from "~/components/shell/AppShell";
import {
  CardSkeleton,
  Skeleton,
  SkeletonText,
  StatRowSkeleton,
} from "~/components/ui/Skeleton";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { StatBlock } from "~/components/ui/Badges";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { useAuth } from "~/lib/ar/store";
import {
  useBrandPinsQuery,
  useBrandsQuery,
  useToggleFollow,
} from "~/lib/ar/usePins";

const compact = (n: number) =>
  n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);

type Tab = "live" | "yours";

/**
 * How many cards the drops grid is willing to mount at once.
 *
 * `HoloCard` is expensive per instance in a way the markup doesn't advertise:
 * each one establishes its own compositing layer (`perspective` +
 * `preserve-3d` + a transform that is never `none`, even at rest) and stacks
 * three `mix-blend-mode` foil layers over its art. Fine for a dozen. The
 * Wadzzo brand account has 102 live drops, and mounting all of them put ~400
 * blended layers, 309 images and 8k DOM nodes on a single page — enough to
 * exhaust the GPU memory budget on iOS Safari, which kills the tab outright
 * rather than degrading. Capping the mounted set bounds that cost regardless
 * of how many drops a brand runs.
 */
const PAGE_SIZE = 24;

/**
 * ── /brands/[id] ───────────────────────────────────────────────────────────
 *
 * A brand's page, split into what they have out right now and what you've
 * already taken from them. Those are genuinely different questions — one is
 * "where do I go next", the other is "what have I got" — and merging them
 * into one grid makes both harder to answer.
 */
export default function BrandDetail() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : null;

  const { brands, isLoading: brandsLoading } = useBrandsQuery();
  const {
    toggle: toggleFollow,
    pendingId: followPendingId,
    labelFor: followLabel,
    error: followError,
  } = useToggleFollow();
  const requireAuth = useAuth((s) => s.requireAuth);
  const signedIn = useAuth((s) => Boolean(s.user));

  const [tab, setTab] = useState<Tab>("live");

  const brand = useMemo(
    () => brands.find((b) => b.id === id) ?? null,
    [brands, id],
  );

  // Counts for the tab labels. These come from the two paginated queries'
  // `total`, not from a client-side filter over every pin on the map — see
  // `useBrandPinsQuery`.
  const liveQuery = useBrandPinsQuery({
    brandId: id,
    tab: "live",
    pageSize: PAGE_SIZE,
  });
  const yoursQuery = useBrandPinsQuery({
    brandId: signedIn ? id : null,
    tab: "yours",
    pageSize: PAGE_SIZE,
  });

  const active = tab === "live" ? liveQuery : yoursQuery;

  // Same reasoning as the card page: absence is only true once the list has
  // actually loaded.
  if (brandsLoading) {
    return (
      <AppShell>
        <div
          className="ar-scroll h-full"
          role="status"
          aria-label="Loading brand"
        >
          <Skeleton className="h-[188px] w-full" rounded="rounded-none" />
          <div className="px-5">
            <Skeleton
              className="-mt-10 h-[76px] w-[76px]"
              rounded="rounded-[20px]"
            />
            <Skeleton rounded="rounded-full" className="mt-3 h-5 w-2/3" />
            <Skeleton rounded="rounded-full" className="mt-2 h-3 w-1/3" />
            <SkeletonText lines={2} className="mt-3.5" />
            <StatRowSkeleton count={3} />
            <Skeleton className="mt-4 h-10 w-full" rounded="rounded-full" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!brand) {
    return (
      <AppShell>
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="font-hud text-[15px] font-bold uppercase tracking-[0.12em] text-ar-dim">
            Brand not found
          </p>
          <ArLinkButton href="/brands" variant="primary" size="md">
            All brands
          </ArLinkButton>
        </div>
      </AppShell>
    );
  }

  const visible = active.pins;
  const remaining = active.total - visible.length;

  return (
    <AppShell>
      <div className="ar-scroll h-full">
        {/* ── Cover ────────────────────────────────────────────────── */}
        <div className="relative h-[188px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/* Not every creator has uploaded a cover; the gradient below
              carries the header on its own when they haven't. */}
          {brand.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-ar-void/70 via-transparent to-ar-bg" />
          <div className="ar-grid absolute inset-0 opacity-25" />

          <div
            className="absolute inset-x-0 top-0 flex items-center justify-between px-4"
            style={{ paddingTop: "calc(var(--ar-top-inset) + 14px)" }}
          >
            <button
              onClick={() => router.back()}
              aria-label="Back"
              className="ar-glass flex h-9 w-9 items-center justify-center rounded-full text-ar-text"
            >
              <ChevronLeft size={17} strokeWidth={2.4} />
            </button>
            <button
              aria-label="Share this brand"
              onClick={() => {
                void navigator
                  .share?.({
                    title: brand.name,
                    text: brand.tagline ?? brand.bio,
                  })
                  .catch(() => undefined);
              }}
              className="ar-glass flex h-9 w-9 items-center justify-center rounded-full text-ar-text"
            >
              <Share2 size={15} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* ── Identity ─────────────────────────────────────────────── */}
        <div className="relative -mt-11 px-5">
          <motion.img
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            src={brand.avatarUrl}
            alt=""
            className="h-[84px] w-[84px] rounded-[22px] object-cover ring-[3px] ring-ar-bg"
          />

          <h1 className="mt-3 flex items-center gap-1.5 text-[21px] font-semibold leading-tight text-ar-text">
            <span className="min-w-0 truncate">{brand.name}</span>
            {brand.verified && (
              <BadgeCheck
                size={17}
                strokeWidth={2.4}
                className="shrink-0 text-ar-green-hot"
                aria-label="Verified"
              />
            )}
          </h1>
          <p className="font-hud mt-0.5 text-[11px] uppercase tracking-[0.14em] text-ar-faint">
            {/* No column names a brand's place, so the separator only earns
                its space when there's actually something after it. */}
            @{brand.handle}
            {brand.region && <> &middot; {brand.region}</>}
          </p>
          {(brand.tagline ?? brand.bio) && (
            <p className="mt-2.5 text-[13px] leading-relaxed text-ar-dim">
              {brand.tagline ?? brand.bio}
            </p>
          )}
        </div>

        {/* ── Stats + follow ───────────────────────────────────────── */}
        <div className="mx-5 mt-4 flex items-center justify-around rounded-ar border border-ar-line bg-white/[0.03] py-3">
          <StatBlock label="Followers" value={compact(brand.followers)} />
          <span className="h-8 w-px bg-ar-line" />
          <StatBlock label="Live now" value={liveQuery.total} accent />
          <span className="h-8 w-px bg-ar-line" />
          <StatBlock label="You hold" value={yoursQuery.total} />
        </div>

        {/* A failed follow is otherwise silent — the button just returns to
            "Follow" and the user is left guessing whether they mis-tapped. */}
        {followError && (
          <div className="mx-5 mt-3 rounded-ar border border-ar-danger/40 bg-ar-danger/10 px-3.5 py-2.5">
            <p className="text-[12px] leading-relaxed text-ar-danger">
              {followError}
            </p>
          </div>
        )}

        <div className="mt-3 flex gap-2 px-5">
          <ArButton
            size="md"
            variant={brand.followed ? "outline" : "primary"}
            block
            busy={followPendingId === brand.id}
            onClick={() => {
              if (!requireAuth("follow")) return;
              toggleFollow(brand);
            }}
          >
            {followLabel(brand)}
          </ArButton>
          <ArLinkButton
            href="/map"
            size="md"
            variant="outline"
            className="shrink-0"
          >
            On map
          </ArLinkButton>
        </div>

        {brand.followed && (
          <p className="mt-2 px-5 text-[11px] leading-relaxed text-ar-faint">
            Their private and members-only drops now show on your map.
          </p>
        )}

        {/* ── Bio ──────────────────────────────────────────────────── */}
        <section className="mt-6 px-5">
          <h2 className="font-hud mb-2 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ar-faint">
            About
          </h2>
          <p className="text-[13px] leading-relaxed text-ar-dim">{brand.bio}</p>
        </section>

        {/* ── Drops ────────────────────────────────────────────────── */}
        <section className="mt-6">
          <SegmentedTabs
            layoutId="brand-detail-tabs"
            value={tab}
            onChange={setTab}
            className="mx-5"
            tabs={[
              { id: "live", label: "Live drops", count: liveQuery.total },
              { id: "yours", label: "Your cards", count: yoursQuery.total },
            ]}
          />

          <div className="mt-4 px-5 pb-8">
            {/* A grid still fetching its first page is not an empty grid.
                Without this the "Nothing live right now" copy flashes on every
                visit before the cards land, which reads as a brand with no
                drops rather than as loading. */}
            {active.isLoading ? (
              <div
                className="grid grid-cols-2 gap-3.5"
                role="status"
                aria-label="Loading drops"
              >
                {Array.from({ length: 4 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            ) : visible.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3.5">
                  {visible.map((pin, i) => (
                    <HoloCard
                      key={pin.id}
                      pin={pin}
                      oneFace
                      className="tcg-card--windowed"
                      priority={i < 2}
                      onClick={() => void router.push(`/collection/${pin.id}`)}
                    />
                  ))}

                  {/* The next page lands *below* what's on screen, so its
                      placeholders go in the same grid rather than replacing
                      it — the cards you were already looking at stay put. */}
                  {active.isFetchingNextPage &&
                    Array.from({
                      length: Math.min(remaining, PAGE_SIZE),
                    }).map((_, i) => <CardSkeleton key={`next-${i}`} />)}
                </div>

                {remaining > 0 && !active.isFetchingNextPage && (
                  <div className="mt-5 flex justify-center">
                    <ArButton
                      variant="outline"
                      size="md"
                      onClick={() => void active.fetchNextPage()}
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
              <div className="py-12 text-center">
                <p className="font-hud text-[13px] font-bold uppercase tracking-[0.14em] text-ar-dim">
                  {tab === "live" ? "Nothing live right now" : "None yet"}
                </p>
                <p className="mx-auto mt-1.5 max-w-[17rem] text-[12.5px] leading-relaxed text-ar-faint">
                  {tab === "live"
                    ? `Follow ${brand.name} and you'll see their next drop the moment it lands.`
                    : `Capture one of ${brand.name}'s pins and it'll show up here.`}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
