"use client";

import { format } from "date-fns";
import { ChevronLeft, ExternalLink, Pin, Share2 } from "lucide-react";
import Link from "next/link";
import { useQueryParams, useRouter } from "~/lib/navigation";
import { useEffect, useState } from "react";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { CommentsSection } from "~/components/events/Comments";
import { AppShell } from "~/components/shell/AppShell";
import { ArLinkButton } from "~/components/ui/ArButton";
import { Skeleton, SkeletonText } from "~/components/ui/Skeleton";
import { shareLink } from "~/lib/ar/events";
import { cn } from "@wadzzo/ui/lib/cn";
import { api } from "~/utils/api";

/**
 * ── /announcements/[id] ────────────────────────────────────────────────────
 *
 * A brand's post in full: every image (swipeable), the whole body, the brand's
 * call to action, and the comment thread. An expired post 404s — the brand
 * set that date for a reason, so a shared link doesn't keep it alive.
 */
export default function AnnouncementScreen() {
  const router = useRouter();
  const { query: urlQuery, ready: urlReady } = useQueryParams();
  const id = typeof urlQuery.id === "string" ? urlQuery.id : "";
  const [copied, setCopied] = useState(false);
  const [index, setIndex] = useState(0);

  const detail = api.events.announcement.useQuery(
    { id },
    { enabled: Boolean(id), retry: (n, e) => e.data?.code !== "NOT_FOUND" && n < 2 },
  );
  const a = detail.data;

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  if (!id || detail.isLoading) {
    return (
      <AppShell tabs={false}>
        <div className="px-5" role="status" aria-label="Loading announcement" style={{ paddingTop: "calc(var(--ar-top-inset) + 70px)" }}>
          <Skeleton rounded="rounded-full" className="h-3 w-1/3" />
          <Skeleton rounded="rounded-full" className="mt-4 h-5 w-4/5" />
          <SkeletonText lines={5} className="mt-4" />
          <Skeleton className="mt-5 h-[200px] w-full" rounded="rounded-ar-lg" />
        </div>
      </AppShell>
    );
  }

  if (!a) {
    return (
      <AppShell tabs={false}>
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="font-hud text-[15px] font-bold uppercase tracking-[0.12em] text-ar-dim">
            {detail.error?.data?.code === "NOT_FOUND" ? "This post is no longer available" : "Couldn't load this post"}
          </p>
          <ArLinkButton href="/events?tab=announcements" variant="primary">
            All news
          </ArLinkButton>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell tabs={false}>
      <div className="flex h-full flex-col">
        <div
          className="flex items-center justify-between px-4 pb-2"
          style={{ paddingTop: "calc(var(--ar-top-inset) + 14px)" }}
        >
          <button
            onClick={() => {
              if (window.history.length > 1) router.back();
              else void router.push("/events?tab=announcements");
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
              aria-label="Share this post"
              onClick={() => void shareLink(a.title, window.location.href).then((r) => setCopied(r === "copied"))}
              className="ar-glass flex h-9 w-9 items-center justify-center rounded-full text-ar-text"
            >
              <Share2 size={15} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        <div className="ar-scroll flex-1 px-5 pb-8">
          <Link href={`/brands/${a.brand.id}`} className="mt-2 flex w-fit items-center gap-2.5">
            <BrandAvatar src={a.brand.imageUrl} className="h-10 w-10 rounded-[12px]" />
            <span>
              <span className="block text-[13.5px] font-semibold text-ar-text">{a.brand.name}</span>
              <span className="font-hud block text-[10.5px] text-ar-faint">
                {format(new Date(a.createdAt), "d MMM yyyy · h:mm a")}
              </span>
            </span>
          </Link>

          {a.pinned && (
            <span className="font-hud mt-3 inline-flex h-[22px] items-center gap-1 rounded-full border border-ar-green/50 bg-ar-green/10 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ar-green-hot">
              <Pin size={10} strokeWidth={2.6} />
              Pinned
            </span>
          )}

          <h1 className="mt-3 text-[21px] font-semibold leading-tight text-ar-text">{a.title}</h1>
          <p className="mt-2.5 whitespace-pre-line break-words text-[14px] leading-relaxed text-ar-dim">{a.body}</p>

          {a.images.length > 0 && (
            <div className="relative mt-4 overflow-hidden rounded-ar-lg">
              <div
                className="ar-scroll-x flex snap-x snap-mandatory"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  setIndex(Math.round(el.scrollLeft / el.clientWidth));
                }}
              >
                {a.images.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={src}
                    src={src}
                    alt=""
                    loading={i === 0 ? "eager" : "lazy"}
                    className="max-h-[360px] w-full shrink-0 snap-center object-cover"
                  />
                ))}
              </div>
              {a.images.length > 1 && (
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                  {a.images.map((src, i) => (
                    <span
                      key={src}
                      className={cn("h-1.5 rounded-full transition-all", i === index ? "w-4 bg-white" : "w-1.5 bg-white/50")}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {a.ctaUrl && (
            <a
              href={a.ctaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ar-key ar-key-primary font-hud mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-ar text-[13px] font-bold uppercase tracking-[0.1em]"
            >
              {a.ctaLabel ?? "Learn more"}
              <ExternalLink size={15} strokeWidth={2.4} />
            </a>
          )}

          <div className="mt-8">
            <CommentsSection target={{ kind: "announcement", id: a.id }} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
