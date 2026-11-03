import { Box, Image as ImageIcon, Music, Repeat2, ShoppingBag, Video } from "lucide-react";
import Link from "next/link";

import type { RouterOutputs } from "~/utils/api";
import { formatPrice, formatUsd, marketplaceItemUrl, TOKEN_CODE } from "~/lib/market";
import { cn } from "@wadzzo/ui/lib/cn";
import { platformBranding } from "@wadzzo/platform/branding";

export type MarketListing = RouterOutputs["market"]["listings"]["items"][number];

export const MEDIA_ICON = { IMAGE: ImageIcon, MUSIC: Music, VIDEO: Video, THREE_D: Box } as const;

/**
 * One marketplace listing: the art, its creator, the price, and "Go to Marketplace" — AR shows
 * items but sends you to the marketplace app to buy. The art and name open the item here.
 */
export function MarketCard({ listing, className }: { listing: MarketListing; className?: string }) {
  const { asset } = listing;
  const resale = listing.placerId !== asset.creatorId;
  const left = asset.limit == null ? null : Math.max(0, asset.limit - asset.mintedCount);
  const href = `/marketplace/${asset.id}${resale ? `?listing=${listing.id}` : ""}`;
  const Media = MEDIA_ICON[asset.mediaType] ?? ImageIcon;
  const usd = formatUsd(listing.priceUSD);

  return (
    <div className={cn("ar-bevel rounded-ar flex flex-col overflow-hidden", className)}>
      <Link href={href} className="group relative block aspect-square overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.thumbnail}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span className="ar-glass absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full">
          <Media size={12} strokeWidth={2.4} className="text-ar-text" />
        </span>
        {resale ? (
          <span className="font-hud bg-rarity-epic/90 absolute top-2 right-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-[0.12em] text-white uppercase">
            <Repeat2 size={10} strokeWidth={2.8} /> Resale
          </span>
        ) : left === 0 ? (
          <span className="font-hud bg-ar-danger/90 absolute top-2 right-2 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-[0.12em] text-white uppercase">
            Sold out
          </span>
        ) : left != null && left <= 10 ? (
          <span className="font-hud bg-rarity-legendary/90 absolute top-2 right-2 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-[0.12em] text-black uppercase">
            {left} left
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <Link href={href} className="min-w-0">
          <p className="text-ar-text truncate text-[13px] leading-tight font-semibold">
            {asset.name}
          </p>
          <p className="text-ar-faint mt-0.5 truncate text-[11px]">
            {resale
              ? `Resale by ${listing.placer?.name ?? "a fan"}`
              : (asset.creator?.name ?? platformBranding.name)}
          </p>
        </Link>

        <p className="mt-auto flex items-baseline gap-1.5">
          <span className="font-hud text-ar-green-hot text-[15px] leading-none font-bold tabular-nums">
            {formatPrice(listing.price)}
          </span>
          <span className="font-hud text-ar-dim text-[9.5px] font-semibold tracking-[0.12em] uppercase">
            {TOKEN_CODE}
          </span>
          {usd && <span className="text-ar-faint ml-auto text-[10px] tabular-nums">{usd}</span>}
        </p>

        <a
          href={marketplaceItemUrl(asset.id, resale ? listing.id : null)}
          className="ar-key ar-key-primary font-hud flex h-8 items-center justify-center gap-1.5 rounded-[10px] text-[10.5px] font-semibold tracking-[0.08em] uppercase"
        >
          <ShoppingBag size={13} strokeWidth={2.4} />
          Go to Marketplace
        </a>
      </div>
    </div>
  );
}
