import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { useEffect } from "react";

import { NearbyCardSkeleton } from "~/components/ui/Skeleton";
import { AR_CAPTURE_RADIUS, formatDistance } from "@wadzzo/ar-core/ar/geo";
import { pinStatus, RARITY_META } from "@wadzzo/ar-core/ar/rarity";
import type { ArPin } from "@wadzzo/ar-core/ar/types";
import { useDragScroll } from "~/lib/ar/useDragScroll";
import { cn } from "@wadzzo/ui/lib/cn";

export interface NearbyPin {
  pin: ArPin;
  distance: number;
}

/**
 * The nearest handful of drops as a thumb-scrollable rail above the tab bar.
 *
 * This is the screen's real navigation: panning a map to find something is
 * work, and the answer to "what's near me" is a short ordered list. Tapping a
 * card flies the camera to it and opens its sheet, so the map becomes a
 * confirmation of the choice rather than the means of making it.
 *
 * The rail auto-scrolls to keep the selected card in view when selection
 * comes from the map instead of from here.
 */
export function NearbyStrip({
  items,
  selectedId,
  onSelect,
  loading = false,
}: {
  items: NearbyPin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Drops are still being fetched — distinct from there being none. */
  loading?: boolean;
}) {
  // Drag-to-scroll for a mouse (see useDragScroll) doubles as the rail's DOM
  // handle for the auto-scroll-into-view effect below — one ref, two jobs.
  const railRef = useDragScroll<HTMLDivElement>();

  useEffect(() => {
    if (!selectedId) return;
    const el = railRef.current?.querySelector<HTMLElement>(`[data-pin="${selectedId}"]`);
    el?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedId]);

  // A cold fetch must not read as "nothing here" — that's a different answer,
  // and the user would stop looking on the strength of it. Skeleton cards in
  // the rail's own shape, so the strip doesn't resize when they resolve.
  if (loading && items.length === 0) {
    return (
      <div
        className="ar-scroll-x flex gap-2.5 px-4 pb-1"
        role="status"
        aria-label="Loading nearby drops"
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <NearbyCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="ar-glass rounded-ar mx-4 px-4 py-3 text-center">
        <p className="font-hud text-ar-dim text-[11px] font-semibold tracking-[0.16em] uppercase">
          Nothing nearby
        </p>
        <p className="text-ar-faint mt-1 text-[11.5px]">
          Try widening the filter, or head toward the city centre.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={railRef}
      className="ar-scroll-x flex gap-2.5 px-4 pb-1"
      role="list"
      aria-label="Nearby drops"
    >
      {items.map(({ pin, distance }) => {
        const rarity = pin.rarity;
        const meta = RARITY_META[rarity];
        const status = pinStatus(pin);
        const inRange = distance <= AR_CAPTURE_RADIUS;
        const active = pin.id === selectedId;

        return (
          <motion.button
            key={pin.id}
            data-pin={pin.id}
            role="listitem"
            whileTap={{ scale: 0.96 }}
            onClick={() => onSelect(pin.id)}
            className={cn(
              "ar-glass rounded-ar relative flex w-[168px] shrink-0 items-center gap-2.5 p-2 text-left transition-colors",
              active && "!border-ar-green/60",
            )}
            style={active ? { boxShadow: `0 0 22px -6px hsl(${meta.hsl} / 0.9)` } : undefined}
          >
            <div
              className="relative h-[46px] w-[34px] shrink-0 overflow-hidden rounded-[8px] border"
              style={{ borderColor: `hsl(${meta.hsl} / 0.55)` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pin.imageUrl}
                alt=""
                loading="lazy"
                className={cn(
                  "h-full w-full object-cover",
                  status !== "collectible" && "brightness-[0.6] saturate-0",
                )}
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-hud text-ar-text truncate text-[11.5px] leading-tight font-bold">
                {pin.title}
              </p>
              <p className="text-ar-faint truncate text-[10px]">{pin.brandName}</p>
              <p
                className={cn(
                  "font-hud mt-1 flex items-center gap-1 text-[10px] leading-none font-bold tabular-nums",
                  inRange && status === "collectible" ? "text-ar-green-hot" : "text-ar-dim",
                )}
              >
                {pin.autoCollect && status === "collectible" && (
                  <Zap size={9} strokeWidth={3} className="text-ar-green-hot" />
                )}
                {formatDistance(distance)}
                {inRange && status === "collectible" && (
                  <span className="text-[8px] tracking-[0.14em] uppercase">&middot; in range</span>
                )}
              </p>
            </div>

            {/* Rarity spine down the trailing edge. */}
            <span
              aria-hidden
              className="absolute inset-y-2 right-1 w-[2.5px] rounded-full"
              style={{ background: `hsl(${meta.hsl})`, opacity: 0.8 }}
            />
          </motion.button>
        );
      })}
    </div>
  );
}
