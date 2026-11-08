import { useRef, useState } from "react";
import toast from "react-hot-toast";

import { freehandToNodes, type Node, type Pt } from "@wadzzo/schemas/shape-geometry";

import type { ShapeHistory } from "./use-shape-history";
import type { Tool } from "./tools";

const clamp = (v: number) => Math.max(0.5, Math.min(99.5, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

function distToSegment(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

type Gesture =
  | { kind: "move"; index: number; moved: boolean }
  | { kind: "pen"; index: number; start: Pt; curved: boolean }
  | { kind: "freehand"; samples: Pt[] }
  | null;

/**
 * What the pointer does on the drawing canvas for the current tool:
 * Pen places points (drag to curve them), Select and Pen move points,
 * Freehand records a stroke and turns it into points when you let go.
 */
export function useCanvasGestures({
  tool,
  snap,
  history,
  setSelected,
  onFreehand,
}: {
  tool: Tool;
  snap: boolean;
  history: ShapeHistory;
  setSelected: (index: number | null) => void;
  /** A finished freehand stroke, as points. */
  onFreehand: (nodes: Node[]) => void;
}) {
  const { nodes, commit, patchNode, beginMove, cancelMove } = history;
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture>(null);
  const [stroke, setStroke] = useState<Pt[]>([]);

  /** The pointer's position in the 100×100 box (snapped to a 5-unit grid when Snap is on). */
  const toBox = (e: { clientX: number; clientY: number }): Pt | null => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const s = (v: number) => (snap ? Math.round(v / 5) * 5 : round1(v));
    return [clamp(s(p.x)), clamp(s(p.y))];
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const p = toBox(e);
    if (!p) return;
    const hit = (e.target as Element).getAttribute("data-node");
    svgRef.current?.setPointerCapture(e.pointerId);

    if (tool === "freehand") {
      gesture.current = { kind: "freehand", samples: [p] };
      setStroke([p]);
      return;
    }
    if (hit !== null && (tool === "select" || tool === "pen")) {
      const index = Number(hit);
      setSelected(index);
      beginMove();
      gesture.current = { kind: "move", index, moved: false };
      return;
    }
    if (tool === "select") {
      setSelected(null);
      return;
    }
    if (tool === "pen") {
      // Near a side: insert there; otherwise add after the last point.
      let at = nodes.length;
      if (nodes.length >= 3) {
        let best = 3;
        nodes.forEach((a, i) => {
          const b = nodes[(i + 1) % nodes.length]!;
          const d = distToSegment(p, [a.x, a.y], [b.x, b.y]);
          if (d < best) {
            best = d;
            at = i + 1;
          }
        });
      }
      commit([...nodes.slice(0, at), { x: p[0], y: p[1], smooth: false }, ...nodes.slice(at)]);
      setSelected(at);
      gesture.current = { kind: "pen", index: at, start: p, curved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = toBox(e);
    if (!p) return;
    if (g.kind === "freehand") {
      g.samples.push(p);
      setStroke([...g.samples]);
    } else if (g.kind === "move") {
      g.moved = true;
      patchNode(g.index, { x: p[0], y: p[1] });
    } else if (
      g.kind === "pen" &&
      !g.curved &&
      Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) > 2.5
    ) {
      // Dragging while placing a point makes it a curve point.
      g.curved = true;
      patchNode(g.index, { smooth: true });
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === "freehand") {
      const drawn = freehandToNodes(g.samples);
      setStroke([]);
      if (drawn.length) onFreehand(drawn);
      else toast("Draw a bigger shape — drag all the way round", { id: "freehand-short" });
    } else if (g.kind === "move" && !g.moved) {
      // A click without a drag only selects: drop the undo step it opened.
      cancelMove();
    }
  };

  return {
    svgRef,
    /** The freehand stroke being drawn, for showing it live. */
    stroke,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
