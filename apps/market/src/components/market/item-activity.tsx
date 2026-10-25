"use client";

import { formatDistanceToNow } from "date-fns";

import { Person } from "@wadzzo/ui/patterns/person";
import { api } from "~/utils/api";
import { Amount } from "~/components/price/amount";

const LABEL = {
  PURCHASE: "Bought",
  RESALE_PURCHASE: "Bought (resale)",
  CLAIM: "Claimed",
  GIFT: "Gifted",
} as const;

/** Recent sales and claims of an item. */
export function ItemActivity({ assetId }: { assetId: number }) {
  const activity = api.market.itemActivity.useQuery({ assetId });
  if (activity.isLoading) return <div className="skeleton h-32 rounded-xl" />;
  if (!activity.data?.length)
    return (
      <p className="marker text-primary py-6 text-center text-base">
        no sales yet — be the first to own this!
      </p>
    );
  return (
    <section>
      <ul className="divide-foreground/10 divide-y-2 divide-dashed">
        {activity.data.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-3">
            <Person
              name={a.buyer?.name}
              image={a.buyer?.image}
              id={a.buyer?.id}
              size="sm"
              sub={LABEL[a.type as keyof typeof LABEL] ?? a.type}
              className="flex-1"
            />
            {a.price > 0 && (
              <span className="display text-xl tabular-nums">
                <Amount value={a.price} currency={a.currency} />
              </span>
            )}
            <time className="text-muted-foreground w-24 text-right text-xs">
              {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
