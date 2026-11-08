import { Eraser, Minus, Plus } from "lucide-react";
import { useMemo, type Dispatch, type RefObject, type SetStateAction } from "react";

import type { Node, Pt } from "@wadzzo/schemas/shape-geometry";
import { Switch } from "@wadzzo/ui/components/switch";
import { cn } from "@wadzzo/ui/lib/cn";
import { Button } from "@wadzzo/ui/poster/button";

import { IconButton } from "./controls";
import type { Tool } from "./tools";

/** How close another point can be (in box units) before a point's tap area shrinks to fit. */
function tapRadii(nodes: Node[]): number[] {
  return nodes.map((a, i) => {
    let nearest = Infinity;
    nodes.forEach((b, j) => {
      if (i !== j) nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y));
    });
    // Big enough for a finger on a phone, never reaching into the next point.
    return Math.max(2, Math.min(5, nearest / 2));
  });
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3.375;

/**
 * The drawing surface: a toolbar (hint, snap, zoom, clear) above the 100×100
 * box where the outline and its points are drawn. What happens when you
 * touch it is `useCanvasGestures`; this only draws.
 */
export function StudioCanvas({
  tool,
  hint,
  path,
  nodes,
  selected,
  stroke,
  pending,
  zoom,
  onZoom,
  snap,
  onSnap,
  canClear,
  onClear,
  svgRef,
  handlers,
}: {
  tool: Tool;
  hint: string;
  /** The outline so far. */
  path: string;
  nodes: Node[];
  selected: number | null;
  /** The freehand stroke being drawn. */
  stroke: Pt[];
  /** An outline waiting to be used (from a trace or the AI), drawn dashed over the drawing. */
  pending: string | null;
  zoom: number;
  onZoom: Dispatch<SetStateAction<number>>;
  snap: boolean;
  onSnap: (snap: boolean) => void;
  canClear: boolean;
  onClear: () => void;
  svgRef: RefObject<SVGSVGElement | null>;
  handlers: Pick<
    React.ComponentProps<"svg">,
    "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
  >;
}) {
  const box = 104 / zoom;
  const origin = 50 - box / 2;
  const showPoints = tool === "select" || tool === "pen";
  const taps = useMemo(() => tapRadii(nodes), [nodes]);
  // Dots shrink as a shape gets busier, so they don't hide the line they sit on.
  const dot = (nodes.length > 60 ? 1 : nodes.length > 30 ? 1.4 : 1.9) / zoom;

  return (
    <>
      <div className="flex w-full max-w-[560px] flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground min-w-0 basis-full sm:flex-1 sm:basis-auto">
          {hint}
        </span>
        <label className="flex items-center gap-1.5">
          <Switch checked={snap} onCheckedChange={onSnap} /> Snap
        </label>
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
          <IconButton
            label="Zoom out"
            icon={Minus}
            disabled={zoom <= MIN_ZOOM}
            onClick={() => onZoom((z) => Math.max(MIN_ZOOM, z / 1.5))}
            small
          />
          <span className="w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <IconButton
            label="Zoom in"
            icon={Plus}
            disabled={zoom >= MAX_ZOOM - 0.05}
            onClick={() => onZoom((z) => Math.min(MAX_ZOOM, z * 1.5))}
            small
          />
        </div>
        <Button type="button" variant="ghost" size="sm" disabled={!canClear} onClick={onClear}>
          <Eraser /> Clear
        </Button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`${origin} ${origin} ${box} ${box}`}
        className={cn(
          "bg-card aspect-square w-full max-w-[min(560px,calc(100dvh-260px))] min-w-[260px] touch-none rounded-xl border select-none",
          tool === "pen" || tool === "freehand" ? "cursor-crosshair" : "cursor-default",
        )}
        {...handlers}
      >
        {Array.from({ length: 21 }, (_, i) => i * 5).map((v) => (
          <g
            key={v}
            className={v % 10 ? "stroke-foreground/5" : "stroke-foreground/10"}
            strokeWidth={0.2 / zoom}
          >
            <line x1={v} y1={0} x2={v} y2={100} />
            <line x1={0} y1={v} x2={100} y2={v} />
          </g>
        ))}
        <rect
          x={0}
          y={0}
          width={100}
          height={100}
          fill="none"
          className="stroke-foreground/30"
          strokeWidth={0.4 / zoom}
        />
        {path && (
          <path
            d={path}
            className="fill-primary/15 stroke-primary"
            strokeWidth={0.7 / zoom}
            strokeLinejoin="round"
          />
        )}
        {/* Points placed so far, before there are enough for a shape */}
        {nodes.length > 0 && nodes.length < 3 && (
          <polyline
            points={nodes.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            className="stroke-primary"
            strokeWidth={0.7 / zoom}
          />
        )}
        {pending && (
          <path
            d={pending}
            fill="none"
            className="stroke-info"
            strokeWidth={0.6 / zoom}
            strokeDasharray={`${2 / zoom} ${1.5 / zoom}`}
          />
        )}
        {stroke.length > 1 && (
          <polyline
            points={stroke.map((p) => p.join(",")).join(" ")}
            fill="none"
            className="stroke-primary"
            strokeWidth={0.8 / zoom}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {showPoints &&
          nodes.map((p, i) => {
            const tap = taps[i]! / zoom;
            const r = Math.min(dot, tap);
            const shape = cn(
              "pointer-events-none",
              i === selected ? "fill-primary stroke-foreground" : "fill-card stroke-primary",
            );
            return (
              <g key={i}>
                {p.smooth ? (
                  <circle cx={p.x} cy={p.y} r={r} strokeWidth={0.6 / zoom} className={shape} />
                ) : (
                  <rect
                    x={p.x - r}
                    y={p.y - r}
                    width={r * 2}
                    height={r * 2}
                    strokeWidth={0.6 / zoom}
                    className={shape}
                  />
                )}
                {/* The invisible, larger area that takes the tap or drag */}
                <circle
                  data-node={i}
                  cx={p.x}
                  cy={p.y}
                  r={tap}
                  className="cursor-move fill-transparent"
                />
              </g>
            );
          })}
      </svg>
      <p className="text-muted-foreground max-w-[560px] text-center text-[11px]">
        ◻ corner point · ○ smooth point · Delete removes the selected point · ⌘Z undo
      </p>
    </>
  );
}
