import { joinSections } from "@wadzzo/geo/trail-geometry";
import { cn } from "@wadzzo/ui/lib/cn";

import { trailColor, type FanTrail } from "~/lib/ar/trails";

/**
 * A trail's shape as a drawing (no map tiles): the path, and each stop as a dot (filled once
 * collected). Cheap enough for list cards; the map shows the real thing in follow mode.
 */
export function TrailShape({
  trail,
  size = 64,
  numbers = false,
  className,
}: {
  trail: Pick<FanTrail, "path" | "color" | "stops">;
  size?: number;
  /** Write each stop's number in its dot (the large drawing on the trail page). */
  numbers?: boolean;
  className?: string;
}) {
  const color = trailColor(trail);
  const pad = numbers ? 16 : 8;
  const line = joinSections(trail.path) ?? [];
  const stops = trail.stops.map((s) => [s.lng, s.lat] as [number, number]);
  const all = [...line, ...stops];
  if (!all.length) return <div className={cn("rounded-ar bg-white/5", className)} aria-hidden />;
  const lngs = all.map((p) => p[0]);
  const lats = all.map((p) => p[1]);
  const minX = Math.min(...lngs);
  const maxY = Math.max(...lats);
  const k = Math.cos((((Math.min(...lats) + maxY) / 2) * Math.PI) / 180);
  const w = (Math.max(...lngs) - minX) * k || 1e-6;
  const h = maxY - Math.min(...lats) || 1e-6;
  const scale = (size - pad * 2) / Math.max(w, h);
  const ox = (size - w * scale) / 2;
  const oy = (size - h * scale) / 2;
  const at = ([lng, lat]: [number, number]) =>
    [ox + (lng - minX) * k * scale, oy + (maxY - lat) * scale] as const;
  const r = numbers ? 9 : 3;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={cn("rounded-ar shrink-0 bg-white/5", className)}
      aria-hidden
    >
      {line.length > 1 && (
        <polyline
          points={line.map((p) => at(p).join(",")).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={numbers ? 3.5 : 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {trail.stops.map((s, i) => {
        const [x, y] = at(stops[i]!);
        return (
          <g key={s.position}>
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={s.done ? color : "#0b0f0c"}
              stroke={s.done ? "white" : color}
              strokeWidth={numbers ? 2 : 1.4}
            />
            {numbers && (
              <text
                x={x}
                y={y + 3.5}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill="white"
              >
                {s.position}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
