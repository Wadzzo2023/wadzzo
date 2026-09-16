import { BadgeCheck, MapPin, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { ArButton } from "~/components/ui/ArButton";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { useAuth } from "~/lib/ar/store";
import type { ArBrand } from "~/lib/ar/types";
import { BrandRowSkeleton } from "~/components/ui/Skeleton";
import { useBrandsQuery, useToggleFollow } from "~/lib/ar/usePins";
import { BrandAvatar } from "~/components/brand/BrandAvatar";

const compact = (n: number) =>
  n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);

/**
 * ── /brands ────────────────────────────────────────────────────────────────
 *
 * Who's putting drops out there. Browsable signed out — the follow button is
 * the only thing behind the gate — because "which brands are near me" is a
 * perfectly good reason to open the app before ever making an account.
 *
 * Following isn't cosmetic here: it's the switch that puts a brand's private
 * and tier-gated drops on your map, which is why the button is the loudest
 * thing on each row.
 */
export default function BrandsScreen() {
  const { brands, isLoading: brandsLoading } = useBrandsQuery();
  const {
    toggle: toggleFollow,
    pendingId: followPendingId,
    labelFor: followLabel,
    error: followError,
  } = useToggleFollow();
  const requireAuth = useAuth((s) => s.requireAuth);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "following">("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return brands.filter((b) => {
      if (tab === "following" && !b.followed) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.handle.toLowerCase().includes(q) ||
        (b.tagline ?? b.bio).toLowerCase().includes(q) ||
        b.categories.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [brands, query, tab]);

  const followingCount = brands.filter((b) => b.followed).length;

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <ScreenHeader eyebrow="Who's dropping" title="Brands" />

        {/* ── Search ───────────────────────────────────────────────── */}
        <div className="px-5">
          <div className="ar-bevel flex h-11 items-center gap-2.5 rounded-ar px-3.5">
            <Search
              size={15}
              strokeWidth={2.2}
              className="shrink-0 text-ar-faint"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search brands"
              aria-label="Search brands"
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

        {/* ── Segments ─────────────────────────────────────────────── */}
        <SegmentedTabs
          layoutId="brand-list-tabs"
          value={tab}
          onChange={setTab}
          className="mx-5 mt-3"
          tabs={[
            { id: "all", label: "All", count: brands.length },
            {
              id: "following",
              label: "Following",
              count: followingCount,
              icon: Users,
            },
          ]}
        />

        {/* ── List ─────────────────────────────────────────────────── */}
        {/* A failed follow is otherwise silent — the button just returns to
            "Follow" and the user is left guessing whether they mis-tapped. */}
        {followError && (
          <div className="mx-5 mt-3 rounded-ar border border-ar-danger/40 bg-ar-danger/10 px-3.5 py-2.5">
            <p className="text-[12px] leading-relaxed text-ar-danger">
              {followError}
            </p>
          </div>
        )}

        <div className="ar-scroll mt-3.5 flex-1 space-y-3 px-5 pb-6">
          {/* Placeholder rows while the first fetch is in flight — the list
              keeps its shape instead of collapsing to the empty state and
              then jumping back open. */}
          {brandsLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <BrandRowSkeleton key={`skeleton-${i}`} />
            ))}

          {shown.map((brand) => (
            <BrandRow
              key={brand.id}
              brand={brand}
              busy={followPendingId === brand.id}
              label={followLabel(brand)}
              onToggle={() => {
                if (!requireAuth("follow")) return;
                toggleFollow(brand);
              }}
            />
          ))}

          {!brandsLoading && shown.length === 0 && (
            <div className="py-16 text-center">
              <p className="font-hud text-[13px] font-bold uppercase tracking-[0.14em] text-ar-dim">
                No brands here
              </p>
              <p className="mx-auto mt-1.5 max-w-[16rem] text-[12.5px] leading-relaxed text-ar-faint">
                {tab === "following"
                  ? "Follow a brand and their private drops start showing up on your map."
                  : "Nothing matches that search."}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function BrandRow({
  brand,
  onToggle,
  busy = false,
  label,
}: {
  brand: ArBrand;
  onToggle: () => void;
  /** This brand's follow is in flight — other rows stay live. */
  busy?: boolean;
  /** Carries the phase text while busy ("Approve in wallet", …). */
  label: string;
}) {
  return (
    <div className="ar-bevel relative overflow-hidden rounded-ar">
      {/* Cover bleed behind the row — brand identity without a whole hero. */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {brand.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.coverUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover opacity-[0.14]"
          />
        )}
        <div className="via-ar-surface/92 absolute inset-0 bg-gradient-to-r from-ar-surface to-ar-surface/70" />
      </div>

      <div className="relative flex items-center gap-3 p-3">
        <Link href={`/brands/${brand.id}`} className="shrink-0">
          <BrandAvatar
            src={brand.avatarUrl}
            className="h-[52px] w-[52px] rounded-[14px] ring-1 ring-white/15"
          />
        </Link>

        <Link href={`/brands/${brand.id}`} className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[14px] font-semibold leading-tight text-ar-text">
            <span className="truncate">{brand.name}</span>
            {brand.verified && (
              <BadgeCheck
                size={14}
                strokeWidth={2.4}
                className="shrink-0 text-ar-green-hot"
                aria-label="Verified"
              />
            )}
          </p>
          {(brand.tagline ?? brand.bio) && (
            <p className="mt-0.5 truncate text-[11.5px] text-ar-faint">
              {brand.tagline ?? brand.bio}
            </p>
          )}
          <p className="font-hud mt-1.5 flex items-center gap-3 text-[10px] font-semibold tabular-nums text-ar-dim">
            <span className="flex items-center gap-1">
              <Users size={10} strokeWidth={2.6} />
              {compact(brand.followers)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={10} strokeWidth={2.6} />
              {brand.pinCount} live
            </span>
            {brand.region && (
              <span className="truncate text-ar-faint">{brand.region}</span>
            )}
          </p>
        </Link>

        <ArButton
          size="sm"
          variant={brand.followed ? "outline" : "primary"}
          onClick={onToggle}
          busy={busy}
          className="min-w-[92px] shrink-0"
        >
          {label}
        </ArButton>
      </div>
    </div>
  );
}
