import { joinSections } from "@wadzzo/geo/trail-geometry";
import { cn } from "@wadzzo/ui/lib/cn";

import { trailColor, type TrailView } from "./trail-lines";

const SIZE = 64;
const PAD = 8;

/**
 * A trail's shape as a small drawing (no map tiles): the path in its colour and a dot per
 * stop. Enough to tell trails apart in a list.
 */
export function TrailThumb({
  trail,
  className,
}: {
  trail: Pick<TrailView, "path" | "color" | "stops">;
  className?: string;
}) {
  const color = trailColor(trail);
  const line = joinSections(trail.path) ?? [];
  const stops = trail.stops.map((s) => [s.pin.longitude, s.pin.latitude] as [number, number]);
  const all = [...line, ...stops];
  if (!all.length) return <div className={cn("bg-surface-2 rounded-xl", className)} aria-hidden />;

  const lngs = all.map((p) => p[0]);
  const lats = all.map((p) => p[1]);
  const minX = Math.min(...lngs);
  const maxY = Math.max(...lats);
  // Longitude degrees are shorter away from the equator: scale them so the shape isn't stretched.
  const k = Math.cos((((Math.min(...lats) + maxY) / 2) * Math.PI) / 180);
  const w = (Math.max(...lngs) - minX) * k || 1e-6;
  const h = maxY - Math.min(...lats) || 1e-6;
  const scale = (SIZE - PAD * 2) / Math.max(w, h);
  const ox = (SIZE - w * scale) / 2;
  const oy = (SIZE - h * scale) / 2;
  const at = ([lng, lat]: [number, number]) =>
    [ox + (lng - minX) * k * scale, oy + (maxY - lat) * scale] as const;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={cn("bg-surface-2 shrink-0 rounded-xl", className)}
      aria-hidden
    >
      {line.length > 1 && (
        <polyline
          points={line.map((p) => at(p).join(",")).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {stops.map((p, i) => {
        const [x, y] = at(p);
        return <circle key={i} cx={x} cy={y} r={3} fill={color} stroke="white" strokeWidth={1.2} />;
      })}
    </svg>
  );
}
