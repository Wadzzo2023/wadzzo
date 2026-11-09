import { useMemo } from "react";
import Svg, { Circle, Polyline, Text as SvgText } from "react-native-svg";

import type { ArTrail } from "~/lib/api/types";
import { trailColor } from "~/lib/ar/trails";

/**
 * The trail's outline without a map (cards, the trail page): the path scaled
 * into a square, with a dot per stop (numbered when `numbers`). Same drawing as
 * the web app's TrailShape.
 */
export function TrailShape({ trail, size, numbers = false }: { trail: ArTrail; size: number; numbers?: boolean }) {
  const color = trailColor(trail);
  const { lines, dots } = useMemo(() => {
    const pts: [number, number][] = [
      ...trail.stops.map((s) => [s.lng, s.lat] as [number, number]),
      ...trail.path.flat(),
    ];
    const lngs = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    // Keep the aspect: longitude degrees shrink with latitude.
    const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const w = Math.max((maxLng - minLng) * k, 1e-6);
    const h = Math.max(maxLat - minLat, 1e-6);
    const pad = size * 0.12;
    const scale = (size - pad * 2) / Math.max(w, h);
    const ox = (size - w * scale) / 2;
    const oy = (size - h * scale) / 2;
    const xy = ([lng, lat]: [number, number]) => [ox + (lng - minLng) * k * scale, oy + (maxLat - lat) * scale] as const;
    const sections = trail.stops.slice(0, -1).map((a, i) => {
      const b = trail.stops[i + 1]!;
      const sec = trail.path[i];
      const coords = sec && sec.length >= 2 ? sec : [[a.lng, a.lat] as [number, number], [b.lng, b.lat] as [number, number]];
      return { done: a.done && b.done, points: coords.map((p) => xy(p).join(",")).join(" ") };
    });
    const stopDots = trail.stops.map((s) => {
      const [x, y] = xy([s.lng, s.lat]);
      return { x, y, n: s.position, done: s.done, required: s.required };
    });
    return { lines: sections, dots: stopDots };
  }, [trail, size]);

  const r = numbers ? Math.max(8, size / 26) : Math.max(3, size / 22);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {lines.map((l, i) => (
        <Polyline key={i} points={l.points} fill="none" stroke={color} strokeOpacity={l.done ? 0.45 : 1} strokeWidth={Math.max(2, size / 70)} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {dots.map((d) => (
        <Circle key={d.n} cx={d.x} cy={d.y} r={r} fill={d.required ? color : "#8a948f"} fillOpacity={d.done ? 0.55 : 1} stroke="#ffffff" strokeWidth={1.5} />
      ))}
      {numbers &&
        dots.map((d) => (
          <SvgText key={`n${d.n}`} x={d.x} y={d.y + r * 0.38} fontSize={r * 1.05} fontWeight="700" fill="#ffffff" textAnchor="middle">
            {String(d.n)}
          </SvgText>
        ))}
    </Svg>
  );
}
