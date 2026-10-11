"use client";

import {
  CalendarPlus,
  Check,
  ChevronLeft,
  Clock,
  ExternalLink,
  MapPin,
  Navigation,
  Share2,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useQueryParams, useRouter } from "~/lib/navigation";
import { useEffect, useState } from "react";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { CommentsSection } from "~/components/events/Comments";
import { AppShell } from "~/components/shell/AppShell";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { Skeleton, SkeletonText } from "~/components/ui/Skeleton";
import {
  directionsUrl,
  eventWhen,
  icsPath,
  liveState,
  shareLink,
  spotsLabel,
  venueMapImage,
} from "~/lib/ar/events";
import { useAuth } from "~/lib/ar/store";
import { useResolvedTheme } from "~/lib/ar/theme";
import type { ArEventDetail } from "~/lib/ar/types";
import { cn } from "~/lib/utils";
import { api } from "~/utils/api";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API;

/**
 * ── /events/[id] ───────────────────────────────────────────────────────────
 *
 * One event, laid out as the answers to the questions people actually ask
 * about one — when, where, how do I get in, who else is going — with the
 * RSVP pinned at the bottom so the one thing to do is always in reach.
 *
 * Venue is optional (online events have none), so where-it-is renders only
 * when there's a place: a static map picture and a Directions hand-off to the
 * device's maps app, not a live map — nothing here needs panning.
 */
export default function EventDetailScreen() {
  const router = useRouter();
  const { query: urlQuery, ready: urlReady } = useQueryParams();
  const id = typeof urlQuery.id === "string" ? urlQuery.id : "";

  const detail = api.events.byId.useQuery(
    { id },
    { enabled: Boolean(id), retry: (n, e) => e.data?.code !== "NOT_FOUND" && n < 2 },
  );
  const event = detail.data;

  if (!id || detail.isLoading) return <DetailSkeleton />;

  if (!event) {
    return (
      <AppShell tabs={false}>
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="font-hud text-[15px] font-bold uppercase tracking-[0.12em] text-ar-dim">
            {detail.error?.data?.code === "NOT_FOUND" ? "Event not found" : "Couldn't load this event"}
          </p>
          <ArLinkButton href="/events" variant="primary">
            All events
          </ArLinkButton>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell tabs={false}>
      <div className="flex h-full flex-col">
        <div className="ar-scroll relative flex-1">
          <Hero event={event} />

          {/* ── Identity ─────────────────────────────────────────── */}
          <div className="relative -mt-8 px-5">
            <Link href={`/brands/${event.brand.id}`} className="flex w-fit items-end gap-2.5">
              <BrandAvatar
                src={event.brand.imageUrl}
                loading="eager"
                className="h-[56px] w-[56px] rounded-[16px] ring-[3px] ring-ar-bg"
              />
              <span className="font-hud mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ar-dim">
                {event.brand.name}
              </span>
            </Link>
            <h1 className="mt-3 text-[21px] font-semibold leading-tight text-ar-text">{event.title}</h1>
          </div>

          {/* ── Facts ────────────────────────────────────────────── */}
          <div className="mx-5 mt-4 divide-y divide-ar-line overflow-hidden rounded-ar-lg border border-ar-line bg-white/[0.02]">
            <WhenRow event={event} />
            <WhereRow event={event} />
            {event.link && (
              <a
                href={event.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]"
              >
                <ExternalLink size={16} strokeWidth={2.3} className="shrink-0 text-ar-green-hot" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-ar-text">
                    {event.linkLabel ?? "Tickets & info"}
                  </span>
                  <span className="block truncate text-[11.5px] text-ar-faint">
                    {event.link.replace(/^https?:\/\//, "")}
                  </span>
                </span>
              </a>
            )}
            <div className="flex items-center gap-3 px-4 py-3">
              <Users size={16} strokeWidth={2.3} className="shrink-0 text-ar-green-hot" />
              <span className={cn("text-[13.5px] font-semibold", event.isFull ? "text-rarity-legendary" : "text-ar-text")}>
                {spotsLabel(event)}
              </span>
              {event.capacity != null && (
                <span className="font-hud ml-auto text-[11px] tabular-nums text-ar-faint">
                  {event.goingCount} going
                </span>
              )}
            </div>
          </div>

          {/* ── About ────────────────────────────────────────────── */}
          <section className="px-5 pt-5">
            <h2 className="font-hud mb-2 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ar-green">
              About
            </h2>
            <p className="whitespace-pre-line break-words text-[14px] leading-relaxed text-ar-dim">
              {event.description}
            </p>
          </section>

          <Linked event={event} />

          <div className="px-5 pb-8 pt-6">
            <CommentsSection target={{ kind: "event", id: event.id }} />
          </div>
        </div>

        {/* ── Pinned bottom bar ────────────────────────────────────── */}
        <div
          className="ar-tabbar-surface relative z-30 rounded-t-ar-xl px-4 pt-3"
          style={{ paddingBottom: "max(12px, var(--ar-safe-bottom))" }}
        >
          <RsvpAction event={event} />
        </div>
      </div>
    </AppShell>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────

function Hero({ event }: { event: ArEventDetail }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const state = liveState(event);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className="relative h-[220px]">
      {event.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.coverImage} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="ar-grid h-full w-full bg-gradient-to-br from-ar-green/25 via-ar-surface to-ar-bg" />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ar-void/70 via-transparent to-ar-bg" />

      <div
        className="absolute inset-x-0 top-0 flex items-center justify-between px-4"
        style={{ paddingTop: "calc(var(--ar-top-inset) + 14px)" }}
      >
        <button
          onClick={() => {
            if (window.history.length > 1) router.back();
            else void router.push("/events");
          }}
          aria-label="Back"
          className="ar-glass flex h-9 w-9 items-center justify-center rounded-full text-ar-text"
        >
          <ChevronLeft size={17} strokeWidth={2.4} />
        </button>
        <div className="flex items-center gap-2">
          {copied && (
            <span className="font-hud ar-glass rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ar-green-hot">
              Link copied
            </span>
          )}
          <button
            aria-label="Share this event"
            onClick={() =>
              void shareLink(event.title, window.location.href).then((r) => setCopied(r === "copied"))
            }
            className="ar-glass flex h-9 w-9 items-center justify-center rounded-full text-ar-text"
          >
            <Share2 size={15} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {state && (
        <span
          className={cn(
            "font-hud absolute bottom-10 right-5 inline-flex h-[22px] items-center gap-1 rounded-full border px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] backdrop-blur-sm",
            state === "live"
              ? "border-ar-green/60 bg-ar-green/20 text-ar-green-hot"
              : "border-ar-line bg-ar-surface/70 text-ar-dim",
          )}
        >
          {state === "live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ar-green-hot" />}
          {state === "live" ? "Happening now" : "Ended"}
        </span>
      )}
    </div>
  );
}

function WhenRow({ event }: { event: ArEventDetail }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Clock size={16} strokeWidth={2.3} className="shrink-0 text-ar-green-hot" />
      <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-ar-text">{eventWhen(event)}</span>
      {!event.isPast && (
        <a
          href={icsPath(event.id)}
          aria-label="Add to calendar"
          className="font-hud flex shrink-0 items-center gap-1 rounded-full border border-ar-line-bright px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ar-dim hover:text-ar-text"
        >
          <CalendarPlus size={12} strokeWidth={2.4} />
          Add
        </a>
      )}
    </div>
  );
}

function WhereRow({ event }: { event: ArEventDetail }) {
  const theme = useResolvedTheme();
  const place = event.venueName ?? event.address;
  const hasPin = event.latitude != null && event.longitude != null;
  if (!place && !hasPin) return null;

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3">
        <MapPin size={16} strokeWidth={2.3} className="shrink-0 text-ar-green-hot" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold text-ar-text">{place ?? "Venue"}</span>
          {event.venueName && event.address && (
            <span className="block text-[11.5px] leading-snug text-ar-faint">{event.address}</span>
          )}
        </span>
        {hasPin && (
          <a
            href={directionsUrl(event.latitude!, event.longitude!)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-hud flex shrink-0 items-center gap-1 rounded-full border border-ar-line-bright px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ar-dim hover:text-ar-text"
          >
            <Navigation size={11} strokeWidth={2.4} />
            Go
          </a>
        )}
      </div>
      {hasPin && MAPBOX_TOKEN && (
        <a
          href={directionsUrl(event.latitude!, event.longitude!)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open directions"
          className="block px-4 pb-3"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={venueMapImage(event.latitude!, event.longitude!, MAPBOX_TOKEN, theme)}
            alt={`Map of ${place ?? "the venue"}`}
            loading="lazy"
            className="h-[130px] w-full rounded-ar object-cover"
          />
        </a>
      )}
    </div>
  );
}

function Linked({ event }: { event: ArEventDetail }) {
  if (event.pins.length === 0 && event.bounties.length === 0) return null;
  return (
    <section className="pt-6">
      <h2 className="font-hud mb-2 px-5 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ar-green">
        At this event
      </h2>
      <div className="ar-scroll-x flex gap-2.5 px-5">
        {event.pins.map((p) => (
          <LinkedTile key={p.id} href={`/directions/${p.id}`} image={p.imageUrl} label="Drop" title={p.title} />
        ))}
        {event.bounties.map((b) => (
          <LinkedTile
            key={b.id}
            href={`/bounty/${b.id}`}
            image={b.imageUrl}
            label="Bounty"
            title={b.title}
            icon
          />
        ))}
      </div>
    </section>
  );
}

function LinkedTile({
  href,
  image,
  label,
  title,
  icon,
}: {
  href: string;
  image: string | null;
  label: string;
  title: string;
  icon?: boolean;
}) {
  return (
    <Link href={href} className="ar-bevel w-[140px] shrink-0 overflow-hidden rounded-ar">
      <div className="relative h-[84px]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="ar-grid flex h-full w-full items-center justify-center bg-gradient-to-br from-ar-green/20 to-ar-surface">
            {icon && <Target size={22} className="text-ar-green-hot" />}
          </div>
        )}
        <span className="font-hud ar-glass absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-ar-green-hot">
          {label}
        </span>
      </div>
      <p className="line-clamp-2 px-2.5 py-2 text-[12px] font-semibold leading-snug text-ar-text">{title}</p>
    </Link>
  );
}

/** The one thing to do next: sign in, RSVP, un-RSVP — or why you can't. */
function RsvpAction({ event }: { event: ArEventDetail }) {
  const user = useAuth((s) => s.user);
  const requireAuth = useAuth((s) => s.requireAuth);
  const utils = api.useUtils();
  const rsvp = api.events.rsvp.useMutation({
    onSuccess: () =>
      Promise.all([utils.events.byId.invalidate({ id: event.id }), utils.events.list.invalidate()]),
  });

  if (event.isPast) {
    return (
      <ArButton block size="lg" variant="outline" disabled>
        This event has ended
      </ArButton>
    );
  }

  const going = event.viewer.going;
  return (
    <div>
      {rsvp.error && <p className="mb-2 text-center text-[12px] text-ar-danger">{rsvp.error.message}</p>}
      {going ? (
        <ArButton
          block
          size="lg"
          variant="outline"
          icon={Check}
          busy={rsvp.isLoading}
          onClick={() => rsvp.mutate({ id: event.id, going: false })}
        >
          You&rsquo;re going · Tap to cancel
        </ArButton>
      ) : event.isFull ? (
        <ArButton block size="lg" variant="outline" disabled>
          This event is full
        </ArButton>
      ) : (
        <ArButton
          block
          size="lg"
          variant="primary"
          busy={rsvp.isLoading}
          onClick={() => {
            if (!user && !requireAuth("events")) return;
            rsvp.mutate({ id: event.id, going: true });
          }}
        >
          {user ? "I'm going" : "Sign in to RSVP"}
        </ArButton>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <AppShell tabs={false}>
      <div className="h-full" role="status" aria-label="Loading event">
        <Skeleton className="h-[220px] w-full" rounded="rounded-none" />
        <div className="px-5">
          <Skeleton className="-mt-8 h-[56px] w-[56px]" rounded="rounded-[16px]" />
          <Skeleton rounded="rounded-full" className="mt-3 h-5 w-4/5" />
          <Skeleton className="mt-4 h-[150px] w-full" rounded="rounded-ar-lg" />
          <SkeletonText lines={4} className="mt-5" />
        </div>
      </div>
    </AppShell>
  );
}
