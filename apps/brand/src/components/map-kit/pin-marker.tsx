"use client";

import type { LucideIcon } from "lucide-react";
import { memo } from "react";
import { Marker } from "react-map-gl/mapbox";

import { BUILTIN_SHAPES, type ResolvedPinLook } from "@wadzzo/schemas/pin-look";
import { markerScale, pathCoverage } from "@wadzzo/schemas/shape-size";
import type { PinOnMap } from "~/store/map-stores";
import { cn } from "@wadzzo/ui/lib/cn";
import { PinGlyph } from "@wadzzo/ui/patterns/pin-glyph";
import { MapPin } from "lucide-react";

export type PinMarkerState = {
  expired: boolean;
  /** No collections left (limit used up). */
  empty: boolean;
  approved: boolean;
  /** Turned down in review (approved === false). */
  rejected?: boolean;
  hidden: boolean;
  autoCollect: boolean;
};

/** A pin's state for drawing it: what the map and the "In view" list both show. `now` is in ms. */
export function pinStateOf(pin: PinOnMap, now: number): PinMarkerState {
  const g = pin.locationGroup;
  return {
    expired: g?.endDate ? new Date(g.endDate).getTime() < now : false,
    empty: g ? g.limit > 0 && g.remaining <= 0 : false, // limit 0 = no limit
    approved: g?.approved === true,
    rejected: g?.approved === false,
    hidden: pin.hidden === true,
    autoCollect: pin.autoCollect === true,
  };
}

export type PinLook = "hidden" | "expired" | "review" | "rejected" | "collected" | "active";

/**
 * One visual language for pins on every portal map (and the same opacities
 * as the fan app): the first matching state wins.
 *
 *   expired            40%  grey border
 *   in review/rejected 60%  amber / red border
 *   collected          80%  blue border   (no collections left)
 *   active            100%  green border  (with a soft pulse)
 *
 * The shape, what fills it and the ⚡ auto-collect badge are the brand's
 * choice (its pin look); the outline colour shows the state.
 */
export function pinLook(s: PinMarkerState): PinLook {
  if (s.hidden) return "hidden";
  if (s.expired) return "expired";
  if (s.rejected) return "rejected";
  if (!s.approved) return "review";
  if (s.empty) return "collected";
  return "active";
}

export const PIN_LOOK: Record<
  PinLook,
  { label: string; opacity: string; border: string; ring: string }
> = {
  active: {
    label: "Active",
    ring: "hsl(var(--primary))",
    opacity: "opacity-100",
    border: "border-primary",
  },
  collected: {
    label: "All collected",
    ring: "hsl(var(--info))",
    opacity: "opacity-80",
    border: "border-info",
  },
  review: {
    label: "In review",
    ring: "hsl(var(--warning))",
    opacity: "opacity-60",
    border: "border-warning",
  },
  rejected: {
    label: "Rejected",
    ring: "hsl(var(--destructive))",
    opacity: "opacity-60",
    border: "border-destructive",
  },
  expired: {
    label: "Expired",
    ring: "hsl(var(--muted-foreground))",
    opacity: "opacity-40",
    border: "border-muted-foreground/60",
  },
  hidden: {
    label: "Deleted",
    ring: "hsl(var(--destructive))",
    opacity: "opacity-40",
    border: "border-dashed border-destructive",
  },
};

/** Marker sizes in px: the full pin, and the small mark used when zoomed out. */
const FULL_SIZE = 44;
const DOT_SIZE = 20;

const scaleCache = new Map<string, number>();
/**
 * How much larger than usual to draw a shape so thin ones carry the weight of round
 * ones (see `markerScale`). Measured once per outline.
 */
export function shapeScale(path: string): number {
  let scale = scaleCache.get(path);
  if (scale === undefined) {
    scale = markerScale(pathCoverage(path));
    scaleCache.set(path, scale);
  }
  return scale;
}

/**
 * A brand's pin on the map: its shape and image (or colour), outlined by state, with how many
 * fans collected it. Zoomed out (`mode="dot"`) it is a small solid mark of the same shape, so a
 * busy map stays readable; thin shapes are drawn a little larger so they look as big as round ones.
 */
export const PinMarker = memo(function PinMarker({
  lat,
  lng,
  image,
  icon: Icon,
  state,
  look,
  count,
  selected,
  onClick,
  label,
  mode = "full",
}: {
  lat: number;
  lng: number;
  image?: string | null;
  icon: LucideIcon;
  state: PinMarkerState;
  /** The brand's pin look, resolved (see resolvePinLook). Without it: a circle with `image`. */
  look?: ResolvedPinLook;
  count: number;
  selected?: boolean;
  onClick?: () => void;
  label: string;
  /** The whole pin, or a small mark of its shape for zoomed-out maps. */
  mode?: "full" | "dot";
}) {
  const stateLook = pinLook(state);
  const style = PIN_LOOK[stateLook];
  const imageUrl = look ? look.imageUrl : (image ?? null);
  const badge = look ? look.autoBadge : state.autoCollect;
  const dot = mode === "dot";
  const path = look?.path ?? BUILTIN_SHAPES.circle.path;
  const size = Math.round((dot ? DOT_SIZE : FULL_SIZE) * shapeScale(path));
  return (
    <Marker
      latitude={lat}
      longitude={lng}
      anchor={look?.anchor === "bottom" ? "bottom" : "center"}
      onClick={(e) => (e.originalEvent.stopPropagation(), onClick?.())}
    >
      <button
        type="button"
        aria-label={`${label} — ${style.label}, ${state.autoCollect ? "auto-collect" : "tap to collect"}`}
        title={`${label} · ${style.label} · ${state.autoCollect ? "Auto-collect" : "Tap to collect"}`}
        className={cn(
          "relative flex items-center justify-center transition-transform hover:scale-110 hover:opacity-100",
          style.opacity,
          stateLook === "expired" && "grayscale",
          selected && "scale-110 opacity-100",
        )}
      >
        {stateLook === "active" && !dot && (
          <span
            className="border-primary/40 absolute inset-0 animate-ping rounded-full border-2"
            aria-hidden
          />
        )}
        <PinGlyph
          path={path}
          size={size}
          // Zoomed out there is no room for the image: the shape is filled with its colour.
          color={dot ? (look?.color ?? style.ring) : look?.color}
          defaultColor="hsl(var(--surface-2, var(--muted)))"
          imageUrl={dot ? null : imageUrl}
          imageFit={dot ? null : look?.imageFit}
          // The state shows in the fill, or on the outline when a brand colour fills the dot.
          ringColor={dot && !look?.color ? "hsl(var(--background))" : style.ring}
          ringWidth={dot ? 1.5 : 2.5}
          badge={dot ? false : badge}
          className={cn(selected && "drop-shadow-[0_0_8px_hsl(var(--primary))]")}
          placeholder={
            // The type icon stands in for a missing image; a plain-colour pin stays plain.
            dot || (look && !look.imageUrl) ? undefined : (
              <Icon className="text-muted-foreground size-5" />
            )
          }
        />
        {count > 0 && !dot && (
          <span className="bg-primary font-hud text-primary-foreground absolute -bottom-1.5 -left-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold shadow">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    </Marker>
  );
});

/**
 * Many pins that would overlap, drawn as one billboard: a small collage of their images
 * with the pin count on top. Click to zoom in to them. It stays upright and facing you
 * when the map is tilted. At most four images, so it stays cheap to draw.
 */
export const ClusterMarker = memo(function ClusterMarker({
  lat,
  lng,
  count,
  images,
  onClick,
}: {
  lat: number;
  lng: number;
  count: number;
  /** Up to four different images from the pins inside; none = a plain tile. */
  images: string[];
  onClick: () => void;
}) {
  const label = count >= 10_000 ? `${Math.floor(count / 1000)}k` : count.toLocaleString("en-US");
  const n = images.length;
  return (
    <Marker
      latitude={lat}
      longitude={lng}
      anchor="center"
      onClick={(e) => (e.originalEvent.stopPropagation(), onClick())}
    >
      <button
        type="button"
        aria-label={`${count} pins here — zoom in`}
        title={`${count.toLocaleString("en-US")} pins · click to zoom in`}
        className="group relative block size-16 transition-transform hover:scale-105"
      >
        <span className="bg-card ring-primary/40 grid size-full grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-xl border-2 border-white shadow-lg ring-2">
          {n === 0 && (
            <span className="bg-primary/15 text-primary col-span-2 row-span-2 flex items-center justify-center">
              <MapPin className="size-6" />
            </span>
          )}
          {images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={(e) => (e.currentTarget.style.visibility = "hidden")}
              className={cn(
                "bg-surface-2 size-full object-cover",
                n === 1 && "col-span-2 row-span-2",
                n === 2 && "row-span-2",
                n === 3 && i === 0 && "row-span-2",
              )}
            />
          ))}
        </span>
        <span className="bg-primary text-primary-foreground font-hud absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border-2 border-white px-2 py-px text-[11px] leading-4 font-bold whitespace-nowrap tabular-nums shadow">
          {label}
        </span>
      </button>
    </Marker>
  );
});
