import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@wadzzo/ui/lib/cn";

/**
 * ── DragSheet ──────────────────────────────────────────────────────────────
 *
 * Google-Maps-style bottom sheet with snap points: drag the handle (or the
 * content, when it's scrolled to the top) up/down, flick to the next snap,
 * tap the handle to cycle. Heights are px of the visible part; the last snap
 * is "full", where the content scrolls.
 */
export function DragSheet({
  snaps,
  initial = 0,
  index: controlled,
  onIndexChange,
  header,
  children,
  className,
}: {
  /** Visible heights in px, ascending. A first snap of 0 means "exactly the header". */
  snaps: number[];
  initial?: number;
  index?: number;
  onIndexChange?: (i: number) => void;
  /** Always-visible top part (inside the drag area). */
  header?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerH, setHeaderH] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(Math.ceil(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // A first snap of 0 = fit the header (plus the safe-area inset below it).
  snaps = snaps[0] === 0 ? [headerH, ...snaps.slice(1)] : snaps;
  const [own, setOwn] = useState(initial);
  const index = Math.min(controlled ?? own, snaps.length - 1);
  const setIndex = useCallback(
    (i: number) => {
      const n = Math.max(0, Math.min(snaps.length - 1, i));
      setOwn(n);
      onIndexChange?.(n);
    },
    [snaps.length, onIndexChange],
  );

  const max = snaps[snaps.length - 1] ?? 0;
  const [drag, setDrag] = useState<number | null>(null); // visible height while dragging
  const start = useRef<{ y: number; h: number; t: number; lastY: number; lastT: number } | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const visible = drag ?? snaps[index] ?? 0;
  const atFull = index === snaps.length - 1 && drag == null;

  const onDown = (e: React.PointerEvent, fromContent: boolean) => {
    // At full height the content scrolls; only the header drags the sheet.
    // Below full, the content doesn't scroll, so dragging it moves the sheet.
    if (fromContent && atFull) return;
    // Let buttons/links inside take their tap.
    if ((e.target as HTMLElement).closest("button, a, input") && fromContent) return;
    start.current = { y: e.clientY, h: visible, t: performance.now(), lastY: e.clientY, lastT: performance.now() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const h = Math.max(snaps[0]! * 0.6, Math.min(max, s.h + (s.y - e.clientY)));
    if (Math.abs(e.clientY - s.y) > 4) setDrag(h);
    s.lastY = e.clientY;
    s.lastT = performance.now();
  };
  const onUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const moved = Math.abs(e.clientY - s.y);
    if (moved <= 4) {
      setDrag(null);
      return;
    }
    const v = (s.y - e.clientY) / Math.max(1, performance.now() - s.t); // px/ms, + = up
    const h = drag ?? s.h;
    let next = snaps.reduce((best, sh, i) => (Math.abs(sh - h) < Math.abs(snaps[best]! - h) ? i : best), 0);
    if (Math.abs(v) > 0.5) next = v > 0 ? Math.min(snaps.length - 1, Math.max(next, index + 1)) : Math.max(0, Math.min(next, index - 1));
    setDrag(null);
    setIndex(next);
  };

  // Leaving "full" scrolls the content back to the top.
  useEffect(() => {
    if (!atFull && scroller.current) scroller.current.scrollTop = 0;
  }, [atFull]);

  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[24px] border-t border-ar-line bg-ar-bg shadow-[0_-12px_32px_-14px_rgba(0,0,0,0.55)]",
        drag == null && "transition-[height] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
        className,
      )}
      style={{ height: visible, touchAction: "none" }}
    >
      <div
        ref={headerRef}
        onPointerDown={(e) => onDown(e, false)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="shrink-0 cursor-grab select-none px-4 pt-2.5 active:cursor-grabbing"
      >
        <button
          type="button"
          aria-label={atFull ? "Collapse" : "Expand"}
          onClick={() => setIndex(index === snaps.length - 1 ? 0 : index + 1)}
          className="mx-auto mb-2.5 block h-1.5 w-11 rounded-full bg-ar-line-bright/70"
        />
        {header}
      </div>
      <div
        ref={scroller}
        onPointerDown={(e) => onDown(e, true)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={cn("min-h-0 flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]", atFull ? "overflow-y-auto" : "overflow-hidden")}
        style={{ touchAction: atFull ? "pan-y" : "none" }}
      >
        {children}
      </div>
    </div>
  );
}
