import { Check, Globe, MapPin, Users } from "lucide-react";
import Link from "next/link";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { Skeleton } from "~/components/ui/Skeleton";
import { dateTile, eventWhen, liveState, spotsLabel } from "~/lib/ar/events";
import type { ArEventCard } from "~/lib/ar/types";
import { cn } from "@wadzzo/ui/lib/cn";

/**
 * ── EventCard ──────────────────────────────────────────────────────────────
 *
 * An event in a list. The date tile leads because "when" is the first thing
 * anyone scanning an events list is looking for; where, who's putting it on
 * and how full it is follow in that order.
 */
export function EventCard({ event }: { event: ArEventCard }) {
  const tile = dateTile(event.startDate);
  const state = liveState(event);
  const full = event.capacity != null && event.goingCount >= event.capacity;

  return (
    <Link
      href={`/events/${event.id}`}
      className={cn(
        "ar-bevel group rounded-ar-lg relative block overflow-hidden",
        state === "ended" && "opacity-80",
      )}
    >
      <div className="relative h-[120px] overflow-hidden">
        {event.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.coverImage}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="ar-grid from-ar-green/20 via-ar-surface to-ar-surface h-full w-full bg-linear-to-br" />
        )}
        <div className="from-ar-surface via-ar-surface/30 absolute inset-0 bg-linear-to-t to-transparent" />

        <div className="ar-glass absolute top-2.5 left-2.5 flex w-12 flex-col items-center rounded-[12px] py-1.5">
          <span className="font-hud text-ar-green text-[9.5px] font-semibold tracking-[0.16em] uppercase">
            {tile.month}
          </span>
          <span className="font-hud text-ar-text text-[20px] leading-none font-bold tabular-nums">
            {tile.day}
          </span>
        </div>

        <div className="absolute top-2.5 right-2.5 flex gap-1.5">
          {state === "live" && (
            <Badge className="border-ar-green/60 bg-ar-green/20 text-ar-green-hot">
              <span className="bg-ar-green-hot h-1.5 w-1.5 animate-pulse rounded-full" />
              Live
            </Badge>
          )}
          {state === "ended" && (
            <Badge className="border-ar-line bg-ar-surface/70 text-ar-dim">Ended</Badge>
          )}
          {event.viewer.going && (
            <Badge className="border-ar-green/60 bg-ar-green/15 text-ar-green-hot">
              <Check size={10} strokeWidth={3} />
              Going
            </Badge>
          )}
        </div>
      </div>

      <div className="relative -mt-6 px-3.5 pb-3.5">
        <div className="flex items-end gap-2">
          <BrandAvatar
            src={event.brand.imageUrl}
            className="ring-ar-surface h-8 w-8 rounded-[10px] ring-2"
          />
          <span className="font-hud text-ar-dim mb-0.5 truncate text-[10.5px] font-semibold tracking-[0.12em] uppercase">
            {event.brand.name}
          </span>
        </div>

        <p className="text-ar-text mt-2 line-clamp-2 text-[15px] leading-snug font-semibold">
          {event.title}
        </p>
        <p className="font-hud text-ar-green mt-1 text-[11px] font-semibold tabular-nums">
          {eventWhen(event)}
        </p>

        <div className="font-hud text-ar-faint mt-2.5 flex items-center justify-between gap-3 text-[10.5px] font-semibold">
          <span className="flex min-w-0 items-center gap-1">
            {(event.venueName ?? event.address) ? (
              <>
                <MapPin size={11} strokeWidth={2.5} className="shrink-0" />
                <span className="truncate">{event.venueName ?? event.address}</span>
              </>
            ) : event.hasLink ? (
              <>
                <Globe size={11} strokeWidth={2.5} className="shrink-0" />
                <span>Online</span>
              </>
            ) : null}
          </span>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 tabular-nums",
              full && "text-rarity-legendary",
            )}
          >
            <Users size={11} strokeWidth={2.5} />
            {spotsLabel(event)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "font-hud inline-flex h-[22px] items-center gap-1 rounded-full border px-2.5 text-[10px] font-semibold tracking-[0.12em] uppercase backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Same footprint as `EventCard`, so the list doesn't jump when data lands. */
export function EventCardSkeleton() {
  return (
    <div className="ar-bevel rounded-ar-lg overflow-hidden">
      <Skeleton className="h-[120px] w-full" rounded="rounded-none" />
      <div className="px-3.5 pt-2 pb-3.5">
        <Skeleton rounded="rounded-full" className="h-2.5 w-1/3" />
        <Skeleton rounded="rounded-full" className="mt-3 h-3.5 w-4/5" />
        <Skeleton rounded="rounded-full" className="mt-2 h-2.5 w-1/2" />
        <div className="mt-3 flex justify-between">
          <Skeleton rounded="rounded-full" className="h-2.5 w-24" />
          <Skeleton rounded="rounded-full" className="h-2.5 w-16" />
        </div>
      </div>
    </div>
  );
}
