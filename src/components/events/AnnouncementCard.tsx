import { formatDistanceToNowStrict } from "date-fns";
import { MessageCircle, Pin } from "lucide-react";
import Link from "next/link";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { Skeleton } from "~/components/ui/Skeleton";
import type { ArAnnouncement } from "~/lib/ar/types";

/**
 * ── AnnouncementCard ───────────────────────────────────────────────────────
 *
 * A brand's post in the feed: who, when, what — and the first image, since a
 * picture is usually why a brand bothered to post. The body is clamped; the
 * full text, every image and the call to action live on the detail page.
 */
export function AnnouncementCard({ announcement: a }: { announcement: ArAnnouncement }) {
  return (
    <Link href={`/announcements/${a.id}`} className="ar-bevel block overflow-hidden rounded-ar-lg">
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5">
        <BrandAvatar src={a.brand.imageUrl} className="h-8 w-8 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-ar-text">{a.brand.name}</p>
          <p className="font-hud text-[10px] text-ar-faint">
            {formatDistanceToNowStrict(new Date(a.createdAt), { addSuffix: true })}
          </p>
        </div>
        {a.pinned && (
          <span className="font-hud inline-flex h-[22px] items-center gap-1 rounded-full border border-ar-green/50 bg-ar-green/10 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ar-green-hot">
            <Pin size={10} strokeWidth={2.6} />
            Pinned
          </span>
        )}
      </div>

      <div className="px-3.5 pb-3 pt-2.5">
        <p className="text-[15px] font-semibold leading-snug text-ar-text">{a.title}</p>
        <p className="mt-1 line-clamp-3 whitespace-pre-line text-[13px] leading-relaxed text-ar-dim">
          {a.body}
        </p>
      </div>

      {a.images[0] && (
        <div className="relative mx-3.5 mb-3 h-[150px] overflow-hidden rounded-ar">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.images[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
          {a.images.length > 1 && (
            <span className="font-hud ar-glass absolute bottom-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-ar-text">
              +{a.images.length - 1}
            </span>
          )}
        </div>
      )}

      <div className="font-hud flex items-center gap-1 border-t border-ar-line px-3.5 py-2 text-[10.5px] font-semibold text-ar-faint">
        <MessageCircle size={11} strokeWidth={2.5} />
        {a.commentCount === 0 ? "Comment" : `${a.commentCount} comment${a.commentCount === 1 ? "" : "s"}`}
        {a.ctaLabel && a.ctaUrl && (
          <span className="ml-auto truncate text-ar-green">{a.ctaLabel} →</span>
        )}
      </div>
    </Link>
  );
}

export function AnnouncementCardSkeleton() {
  return (
    <div className="ar-bevel rounded-ar-lg p-3.5">
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-8 w-8" rounded="rounded-[10px]" />
        <div className="flex-1">
          <Skeleton rounded="rounded-full" className="h-2.5 w-1/3" />
          <Skeleton rounded="rounded-full" className="mt-1.5 h-2 w-1/5" />
        </div>
      </div>
      <Skeleton rounded="rounded-full" className="mt-3.5 h-3.5 w-3/4" />
      <Skeleton rounded="rounded-full" className="mt-2 h-2.5 w-full" />
      <Skeleton rounded="rounded-full" className="mt-1.5 h-2.5 w-2/3" />
    </div>
  );
}
