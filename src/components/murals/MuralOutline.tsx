import { useEffect, useRef, useState } from "react";

import { corners, type Outline, type Pt } from "~/lib/murals/localize";
import type { ArtKind } from "~/lib/murals/useMuralDetector";

/**
 * ── MuralOutline ───────────────────────────────────────────────────────────
 *
 * Draws the detected mural's shape on top of the camera (2026-10-05 round):
 * a perspective quad when the wall edges were found, otherwise a box.
 *
 *   acquiring  dashed outline marching around the art, gently following it
 *   locked     solid glowing outline + corner brackets + "MURAL 92%" chip
 *   sweeping   the outline frozen at lock, sliding with the turn; a dashed
 *              ghost with notches marks where it should land for this stop
 *
 * The outline comes in normalised video-frame coordinates; the video is
 * `object-cover`, so it's mapped through the same crop. Corners tween every
 * animation frame so a 2 Hz detector still looks smooth.
 */

type Mode = "acquiring" | "locked" | "sweeping";

function mapToScreen(p: Pt, W: number, H: number, aspect: number): Pt {
  // object-cover: scale to fill, centre, crop the overflow.
  const dispW = W / H > aspect ? W : H * aspect;
  const dispH = W / H > aspect ? W / aspect : H;
  return { x: (W - dispW) / 2 + p.x * dispW, y: (H - dispH) / 2 + p.y * dispH };
}

const lerp = (a: Pt, b: Pt, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Short L-shaped brackets at each corner, pointing along both edges. */
function bracketPath(c: Pt[], len = 18) {
  return c
    .map((p, i) => {
      const prev = c[(i + 3) % 4]!;
      const next = c[(i + 1) % 4]!;
      const toward = (q: Pt) => {
        const d = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        const l = Math.min(len, d / 3);
        return { x: p.x + ((q.x - p.x) / d) * l, y: p.y + ((q.y - p.y) / d) * l };
      };
      const a = toward(prev);
      const b = toward(next);
      return `M${a.x},${a.y} L${p.x},${p.y} L${b.x},${b.y}`;
    })
    .join(" ");
}

export function MuralOutline({
  outline,
  aspect,
  mode,
  kind,
  score,
  offsetX = 0,
  targetOffsetX = null,
}: {
  outline: Outline | null;
  aspect: number;
  mode: Mode;
  kind: ArtKind;
  score: number;
  /** Sweeping: px the outline has slid with the turn. */
  offsetX?: number;
  /** Sweeping: px offset where the outline should land for this stop. */
  targetOffsetX?: number | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ W: 0, H: 0 });
  const [shown, setShown] = useState<Pt[] | null>(null);
  const target = useRef<Pt[] | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ W: e!.contentRect.width, H: e!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // New detection → new tween target, in screen px.
  useEffect(() => {
    target.current = outline && size.W ? corners(outline).map((p) => mapToScreen(p, size.W, size.H, aspect)) : null;
  }, [outline, size, aspect]);

  // Tween every frame towards the target.
  useEffect(() => {
    let raf = 0;
    const step = () => {
      setShown((cur) => {
        const t = target.current;
        if (!t) return null;
        if (!cur) return t;
        return cur.map((p, i) => lerp(p, t[i]!, 0.22));
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pts = shown?.map((p) => ({ x: p.x + offsetX, y: p.y }));
  const poly = pts?.map((p) => `${p.x},${p.y}`).join(" ");
  const solid = mode !== "acquiring";

  return (
    <div ref={host} className="pointer-events-none absolute inset-0 z-[5]">
      {pts && (
        <svg width={size.W} height={size.H} className="absolute inset-0 overflow-visible">
          {/* Sweep target: a ghost of where the outline should land. */}
          {mode === "sweeping" && targetOffsetX != null && shown && (
            <g className="ar-outline-ghost">
              <polygon
                points={shown.map((p) => `${p.x + targetOffsetX},${p.y}`).join(" ")}
                fill="none"
                stroke="hsl(var(--rarity-epic) / 0.55)"
                strokeWidth={2}
                strokeDasharray="6 8"
              />
              {[0, 3].map((i) => {
                const a = shown[i]!;
                const b = shown[i === 0 ? 1 : 2]!;
                // Notches at the mid-top and mid-bottom of the target edges.
                const mx = (a.x + b.x) / 2 + targetOffsetX;
                const my = (a.y + b.y) / 2;
                return <path key={i} d={`M${mx},${my - 10} L${mx},${my + 10}`} stroke="hsl(var(--rarity-epic))" strokeWidth={3} strokeLinecap="round" />;
              })}
            </g>
          )}

          {/* Soft fill so the art reads as "selected" */}
          <polygon points={poly} fill={solid ? "hsl(var(--rarity-epic) / 0.10)" : "hsl(var(--rarity-epic) / 0.05)"} />
          <polygon
            points={poly}
            fill="none"
            stroke="hsl(var(--rarity-epic))"
            strokeWidth={solid ? 3 : 2.5}
            strokeLinejoin="round"
            strokeDasharray={solid ? undefined : "10 8"}
            className={solid ? "ar-outline-glow" : "ar-outline-march"}
          />
          {solid && <path d={bracketPath(pts)} fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      )}

      {/* Label chip at the top-left corner */}
      {pts && (
        <div
          className="font-hud absolute flex -translate-y-[calc(100%+6px)] items-center gap-1.5 whitespace-nowrap rounded-full border border-rarity-epic/60 bg-ar-void/80 px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.14em] text-white transition-opacity"
          style={{ left: Math.max(6, Math.min(pts[0]!.x, size.W - 120)), top: Math.max(30, pts[0]!.y) }}
        >
          <span className={solid ? "h-1.5 w-1.5 rounded-full bg-ar-green-hot" : "h-1.5 w-1.5 animate-pulse rounded-full bg-rarity-epic"} />
          {kind}
          <span className="tabular-nums text-rarity-epic">{Math.round(score * 100)}%</span>
        </div>
      )}
    </div>
  );
}
