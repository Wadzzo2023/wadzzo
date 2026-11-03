"use client";

import { Lock, Repeat2, ShoppingBag } from "lucide-react";
import Link from "next/link";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { MarketCard, MEDIA_ICON } from "~/components/market/MarketCard";
import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { ArButton } from "~/components/ui/ArButton";
import { StatBlock } from "~/components/ui/Badges";
import { Skeleton, SkeletonText } from "~/components/ui/Skeleton";
import { formatPrice, formatUsd, marketplaceItemUrl, MEDIA_LABEL, TOKEN_CODE } from "~/lib/market";
import { useQueryParams } from "~/lib/navigation";
import { platformBranding } from "@wadzzo/platform/branding";
import { api } from "~/utils/api";

/**
 * ── /marketplace/[id] ──────────────────────────────────────────────────────
 *
 * One marketplace item, as in the marketplace app: the art, who made it, the price and the
 * edition, the description, fan resales and more from the creator. `?listing=<id>` shows one fan
 * resale instead of the creator's own listing. Buying happens in the marketplace app — the main
 * button goes there, on the same listing.
 */
export default function MarketItemScreen() {
  const { query } = useQueryParams();
  const id = Number(query.id);
  const valid = Number.isInteger(id);
  const wanted = Number(query.listing);

  const item = api.market.item.useQuery({ assetId: id }, { enabled: valid, retry: false });
  const related = api.market.related.useQuery({ assetId: id }, { enabled: valid && !!item.data });

  if (!valid || item.isError)
    return (
      <AppShell>
        <ScreenHeader back title="Item" />
        <div className="px-5 py-16 text-center">
          <p className="font-hud text-ar-dim text-[13px] font-bold tracking-[0.14em] uppercase">
            Item not found
          </p>
          <p className="text-ar-faint mx-auto mt-1.5 max-w-[16rem] text-[12.5px] leading-relaxed">
            It may have sold out or been taken off the marketplace.
          </p>
          <Link
            href="/marketplace"
            className="font-hud text-ar-green mt-4 inline-block text-[11px] font-semibold tracking-[0.14em] uppercase hover:underline"
          >
            ← Back to the marketplace
          </Link>
        </div>
      </AppShell>
    );

  const data = item.data;
  const resale =
    data && Number.isInteger(wanted) ? data.resales.find((r) => r.id === wanted) : null;
  const listing = resale ?? data?.original ?? data?.resales[0] ?? null;
  const left = data?.limit == null ? null : Math.max(0, data.limit - data.mintedCount);
  const Media = data ? MEDIA_ICON[data.mediaType] : null;
  const resales = related.data?.resales.filter((r) => r.id !== resale?.id) ?? [];
  const usd = formatUsd(listing?.priceUSD);

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <ScreenHeader back eyebrow="Marketplace" title={data?.name ?? "Loading…"} />

        <div className="ar-scroll flex-1 space-y-5 px-5 pb-8">
          {/* ── Art ──────────────────────────────────────────────── */}
          {!data ? (
            <Skeleton className="aspect-square w-full" rounded="rounded-ar-lg" />
          ) : (
            <div className="ar-bevel rounded-ar-lg relative overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.thumbnail}
                alt={data.name}
                className="aspect-square w-full object-cover"
              />
              <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                {Media && (
                  <span className="ar-glass font-hud text-ar-text flex items-center gap-1 rounded-full px-2.5 py-1 text-[9.5px] font-bold tracking-[0.12em] uppercase">
                    <Media size={11} strokeWidth={2.6} /> {MEDIA_LABEL[data.mediaType]}
                  </span>
                )}
                {resale && (
                  <span className="font-hud bg-rarity-epic/90 flex items-center gap-1 rounded-full px-2.5 py-1 text-[9.5px] font-bold tracking-[0.12em] text-white uppercase">
                    <Repeat2 size={11} strokeWidth={2.8} /> Fan resale
                  </span>
                )}
                {(data.privacy === "TIER" || data.privacy === "PRIVATE") && !resale && (
                  <span className="ar-glass font-hud text-ar-text flex items-center gap-1 rounded-full px-2.5 py-1 text-[9.5px] font-bold tracking-[0.12em] uppercase">
                    <Lock size={11} strokeWidth={2.6} />
                    {data.privacy === "TIER"
                      ? `${data.tier?.name ?? "Tier"} members`
                      : "Followers only"}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Creator ──────────────────────────────────────────── */}
          {!data ? (
            <SkeletonText lines={2} />
          ) : (
            <div className="flex items-center gap-3">
              <BrandAvatar
                src={data.creator?.profileUrl ?? null}
                className="h-11 w-11 rounded-[12px] ring-1 ring-white/15"
              />
              <div className="min-w-0 flex-1">
                <p className="font-hud text-ar-faint text-[9.5px] font-semibold tracking-[0.18em] uppercase">
                  {resale ? `Resale by ${resale.placer?.name ?? "a fan"}` : "Created by"}
                </p>
                <p className="text-ar-text truncate text-[15px] font-semibold">
                  {data.creator?.name ?? platformBranding.name}
                </p>
              </div>
            </div>
          )}

          {/* ── Price + buy ──────────────────────────────────────── */}
          {data && (
            <div className="ar-bevel rounded-ar space-y-3 p-4">
              {listing ? (
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="font-hud text-ar-faint text-[9.5px] font-semibold tracking-[0.18em] uppercase">
                      {resale ? "Resale price" : "Price"}
                    </p>
                    <p className="mt-1 flex items-baseline gap-1.5">
                      <span className="font-hud text-ar-green-hot text-glow-soft text-[30px] leading-none font-bold tabular-nums">
                        {formatPrice(listing.price)}
                      </span>
                      <span className="font-hud text-ar-dim text-[11px] font-semibold tracking-[0.12em] uppercase">
                        {TOKEN_CODE}
                      </span>
                    </p>
                  </div>
                  {usd && <p className="text-ar-dim text-[12px] tabular-nums">{usd}</p>}
                </div>
              ) : (
                <p className="text-ar-dim text-[13px]">Not listed for sale right now.</p>
              )}
              <a
                href={marketplaceItemUrl(data.id, resale ? resale.id : null)}
                className="ar-key ar-key-primary font-hud rounded-ar flex h-12 items-center justify-center gap-2 text-[13.5px] font-semibold tracking-[0.08em] uppercase"
              >
                <ShoppingBag size={17} strokeWidth={2.3} />
                Go to Marketplace
              </a>
              <p className="text-ar-faint text-center text-[11px] leading-relaxed">
                Buying, wallets and resales happen in the {platformBranding.name} marketplace.
              </p>
            </div>
          )}

          {/* ── Edition stats ────────────────────────────────────── */}
          {data && (
            <div className="ar-bevel rounded-ar flex items-center justify-around py-3">
              <StatBlock
                label="Edition"
                value={data.limit == null ? "Open" : data.limit.toLocaleString("en-US")}
              />
              <StatBlock label="Minted" value={data.mintedCount.toLocaleString("en-US")} />
              {left != null && (
                <StatBlock
                  label="Left"
                  value={left === 0 ? "0" : left.toLocaleString("en-US")}
                  accent={left > 0}
                />
              )}
              <StatBlock label="Royalty" value={`${data.royaltyPercent}%`} />
            </div>
          )}

          {/* ── Description ──────────────────────────────────────── */}
          {data && (
            <section>
              <h2 className="font-hud text-ar-dim mb-1.5 text-[10px] font-semibold tracking-[0.24em] uppercase">
                About
              </h2>
              <p className="text-ar-text/85 text-[13px] leading-relaxed whitespace-pre-line">
                {data.description?.trim() ? data.description : "No description yet."}
              </p>
            </section>
          )}

          {/* ── Related ──────────────────────────────────────────── */}
          {resales.length > 0 && <RelatedGrid title="Fan resales" items={resales} />}
          {data?.creator && (related.data?.moreFromCreator.length ?? 0) > 0 && (
            <RelatedGrid
              title={`More from ${data.creator.name}`}
              items={related.data!.moreFromCreator}
            />
          )}
          {(related.data?.similar.length ?? 0) > 0 && data && (
            <RelatedGrid
              title={`More ${MEDIA_LABEL[data.mediaType] ?? ""} items`}
              items={related.data!.similar}
            />
          )}

          {related.isError && (
            <ArButton size="sm" variant="ghost" onClick={() => void related.refetch()}>
              Couldn&apos;t load more items — retry
            </ArButton>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function RelatedGrid({
  title,
  items,
}: {
  title: string;
  items: Parameters<typeof MarketCard>[0]["listing"][];
}) {
  return (
    <section>
      <h2 className="font-hud text-ar-dim mb-2 text-[10px] font-semibold tracking-[0.24em] uppercase">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {items.map((l) => (
          <MarketCard key={l.id} listing={l} />
        ))}
      </div>
    </section>
  );
}
