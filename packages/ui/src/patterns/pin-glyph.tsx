"use client";

import { Zap } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "../lib/cn";

/** The plain circle a pin is drawn with when it has no shape of its own. */
export const DEFAULT_PIN_PATH = "M50 4 A46 46 0 1 1 49.99 4 Z";

/**
 * A pin's mark on a web map: the brand's shape (an outline in a 100×100 box),
 * the image clipped inside it or a solid colour, a state-coloured outline
 * following the shape's edge, and an optional ⚡ auto-collect badge.
 *
 * Everything is drawn here from the outline path alone, which the server has
 * already checked (`checkShapePath` in @wadzzo/schemas/pin-look). If the
 * image fails to load, the shape falls back to the solid colour.
 *
 * The native app has a matching component (apps/mobile/.../PinGlyph.tsx).
 */
export function PinGlyph({
  path = DEFAULT_PIN_PATH,
  size = 44,
  color,
  defaultColor = "hsl(var(--primary))",
  imageUrl,
  imageFit,
  ringColor,
  ringWidth = 2.5,
  badge = false,
  placeholder,
  className,
  imageClassName,
}: {
  /** The outline in a 100×100 box. A circle when left out. */
  path?: string;
  /** Width and height in px. */
  size?: number;
  /** The brand's colour: the fill when there's no image, else the ring when `ringColor` is unset. */
  color?: string | null;
  defaultColor?: string;
  imageUrl?: string | null;
  /** zoom ≥ 1; x / y from -1 to 1 move the image within what the zoom leaves room for. */
  imageFit?: { zoom: number; x: number; y: number } | null;
  /** Outline colour (pins use it for their state). Defaults to the brand colour. */
  ringColor?: string;
  ringWidth?: number;
  badge?: boolean;
  /** Shown centred over the solid fill when there's no image (e.g. a type icon). */
  placeholder?: ReactNode;
  className?: string;
  imageClassName?: string;
}) {
  const clipId = `pin-glyph-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const fill = color ?? defaultColor;
  const showImage = Boolean(imageUrl) && failedUrl !== imageUrl;

  const zoom = Math.max(1, Math.min(4, imageFit?.zoom ?? 1));
  const room = (zoom - 1) * 50;
  const ix = 50 - 50 * zoom + Math.max(-1, Math.min(1, imageFit?.x ?? 0)) * room;
  const iy = 50 - 50 * zoom + Math.max(-1, Math.min(1, imageFit?.y ?? 0)) * room;

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="overflow-visible drop-shadow-md"
        aria-hidden
      >
        <defs>
          <clipPath id={clipId}>
            <path d={path} />
          </clipPath>
        </defs>
        {/* Base: the colour shows through until (or unless) the image loads. */}
        {/* Colours go through style, so CSS variables (theme tokens) work too. */}
        <path d={path} style={{ fill: showImage ? "var(--pin-glyph-under, #fff)" : fill }} />
        {showImage && (
          <image
            href={imageUrl!}
            x={ix}
            y={iy}
            width={100 * zoom}
            height={100 * zoom}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
            className={imageClassName}
            onError={() => setFailedUrl(imageUrl ?? null)}
          />
        )}
        <path
          d={path}
          fill="none"
          style={{ stroke: ringColor ?? fill }}
          strokeWidth={ringWidth}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {!showImage && placeholder && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-white">
          {placeholder}
        </span>
      )}
      {badge && (
        <span
          className="absolute -top-1 -right-1 flex size-[17px] items-center justify-center rounded-full border border-black/50 bg-[#22c55e] text-[#052e16] shadow"
          title="Auto-collect"
        >
          <Zap className="size-[10px]" strokeWidth={3.4} />
        </span>
      )}
    </span>
  );
}
