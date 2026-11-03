"use client";

import { Diamond } from "lucide-react";
import Link from "next/link";

import { PLATFORM_ASSET } from "@wadzzo/wallet/config";
import { api } from "~/utils/api";
import { Amount } from "~/components/price/amount";
import { platformBranding } from "@wadzzo/platform/branding";

/**
 * The strip across the top of every page, like an exchange ticker: what's on
 * the market right now. One transform animation (pauses on hover); nothing else moves.
 */
export function MarketTicker() {
  const listings = api.market.listings.useQuery(
    { kind: "all", limit: 14 },
    { staleTime: 5 * 60_000 },
  );
  const items = listings.data?.items ?? [];
  const row = [...items, ...items];
  return (
    // Phones (below md, where the phone header and tab bar take over) don't show the ticker.
    <div className="bg-side-ink text-side-mint relative hidden h-11 items-center overflow-hidden md:flex">
      <span className="flex h-full shrink-0 items-center gap-2 pr-3 pl-4 text-sm font-bold">
        <Diamond className="fill-side text-side size-3.5" /> On the market
      </span>
      <div className="group flex min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_3%,black_97%,transparent)]">
        {items.length > 2 && (
          <div className="animate-marquee flex shrink-0 items-center gap-7 pl-4 group-hover:[animation-play-state:paused]">
            {row.map((l, idx) => (
              <Link
                key={`${l.id}-${idx}`}
                href={`/item/${l.asset.id}`}
                tabIndex={idx >= items.length ? -1 : undefined}
                className="text-side-mint/70 hover:text-side-mint flex shrink-0 items-center gap-2 text-sm transition-colors"
              >
                <span className="display text-side-mint text-base">
                  {l.asset.creator?.name ?? platformBranding.name}
                </span>
                <span className="max-w-[14rem] truncate">{l.asset.name}</span>
                <span className="text-side font-semibold tabular-nums">
                  <Amount value={l.price} currency={PLATFORM_ASSET.code} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
