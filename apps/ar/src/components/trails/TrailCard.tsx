"use client";

import { Check, Footprints, Gift, MapPin, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { distanceMeters } from "@wadzzo/ar-core/ar/geo";
import type { GeoFix } from "@wadzzo/ar-core/ar/types";
import { cn } from "@wadzzo/ui/lib/cn";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { Skeleton } from "~/components/ui/Skeleton";
import { useResolvedTheme } from "~/lib/ar/theme";
import {
  distanceLabel,
  MODE_VERB,
  routeMapImage,
  trailColor,
  type FanTrail,
} from "~/lib/ar/trails";

import { TrailShape } from "./TrailShape";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API;

/**
 * ── TrailCard ──────────────────────────────────────────────────────────────
 *
 * A trail in a list, built like the EventCard: a banner (the brand's cover, or the route on
 * a map), the brand, the title, then what it takes (stops, length, time) and how far the
 * start is. Started trails show how far along you are.
 */
export function TrailCard({ trail: t, fix }: { trail: FanTrail; fix?: GeoFix | null }) {
  const theme = useResolvedTheme();
  const color = trailColor(t);
  const { done, total, complete } = t.progress;
  const start = t.stops[0];
  const away = fix && start ? distanceMeters(fix, start) : null;

  return (
    <Link
      href={`/trails/${t.id}`}
      className="ar-bevel group rounded-ar-lg relative block overflow-hidden transition-transform active:scale-[0.99]"
    >
      <div className="relative h-[132px] overflow-hidden">
        {t.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={t.coverImage}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : MAPBOX_TOKEN ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={routeMapImage(t, MAPBOX_TOKEN, theme)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="ar-grid flex h-full w-full items-center justify-center">
            <TrailShape trail={t} className="h-full" />
          </div>
        )}
        <div className="from-ar-surface via-ar-surface/20 absolute inset-0 bg-linear-to-t to-transparent" />

        <div className="absolute top-2.5 right-2.5 flex gap-1.5">
          {complete ? (
            <Badge className="border-ar-green/60 bg-ar-green/20 text-ar-green-hot">
              <Check size={10} strokeWidth={3} /> Finished
            </Badge>
          ) : t.run ? (
            <Badge className="border-ar-green/60 bg-ar-green/15 text-ar-green-hot">
              {done}/{total} done
            </Badge>
          ) : null}
          {t.reward && !t.reward.claimed && t.reward.remaining > 0 && (
            <Badge className="border-ar-line bg-ar-surface/80 text-ar-text">
              <Gift size={10} className="text-ar-green-hot" /> Reward
            </Badge>
          )}
        </div>
      </div>

      <div className="relative -mt-6 px-3.5 pb-3.5">
        <div className="flex items-end gap-2">
          <BrandAvatar
            src={t.brand.imageUrl}
            className="ring-ar-surface h-8 w-8 rounded-[10px] ring-2"
          />
          <span className="font-hud text-ar-dim mb-0.5 truncate text-[10.5px] font-semibold tracking-[0.12em] uppercase">
            {t.brand.name}
          </span>
        </div>

        <p className="text-ar-text mt-2 line-clamp-2 text-[15px] leading-snug font-semibold">
          {t.title}
        </p>
        <p className="font-hud mt-1 text-[11px] font-semibold tabular-nums" style={{ color }}>
          {total} stops · {distanceLabel(t.distanceMetres)} · ~{t.estMinutes} min{" "}
          {MODE_VERB[t.mode] ?? ""}
        </p>

        {t.run && !complete && (
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${total ? (done / total) * 100 : 0}%`, backgroundColor: color }}
            />
          </div>
        )}

        <div className="font-hud text-ar-faint mt-2.5 flex items-center justify-between gap-3 text-[10.5px] font-semibold">
          <span className="flex min-w-0 items-center gap-1 truncate">
            {away !== null ? (
              <>
                <MapPin size={11} /> Starts {distanceLabel(away)} away
              </>
            ) : (
              <>
                <Footprints size={11} /> {t.order === "ORDERED" ? "In order" : "Any order"}
              </>
            )}
          </span>
          {t.runners > 0 && (
            <span className="flex shrink-0 items-center gap-1 tabular-nums">
              <Users size={11} /> {t.runners} on it
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function TrailCardSkeleton() {
  return (
    <div className="ar-bevel rounded-ar-lg overflow-hidden">
      <Skeleton className="h-[132px] w-full rounded-none" />
      <div className="space-y-2 px-3.5 pt-2 pb-3.5">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "font-hud flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-bold tracking-[0.12em] uppercase backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </span>
  );
}
