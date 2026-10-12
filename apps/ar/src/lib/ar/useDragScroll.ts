import { useEffect, useRef } from "react";

/**
 * ── useDragScroll ──────────────────────────────────────────────────────────
 *
 * Makes a horizontally-scrolling row (`.ar-scroll-x`: `overflow-x: auto`,
 * scrollbar hidden) usable with a mouse, not just a finger.
 *
 * On a phone these rows already work — touch panning is native and free.
 * But this app is reviewed and demoed inside the desktop device shell
 * (`DeviceFrame`), where the input is a mouse: there's no touch panning, the
 * scrollbar is intentionally hidden so there's nothing to grab, and a plain
 * wheel only scrolls the page vertically, never the row. Without this, every
 * chip row and card rail in the app is functionally frozen for anyone
 * reviewing on a laptop.
 *
 * Two behaviours, both mouse-only — touch and pen keep the browser's native
 * handling untouched, which is correct and shouldn't be fought:
 *
 *  1. Click-and-drag pans the row, the way a trackpad or a design tool's
 *     canvas does. A small movement threshold stops an ordinary click (on a
 *     chip, a card, a button inside the row) from being swallowed as a drag.
 *
 *  2. A plain vertical wheel scrolls the row horizontally when the pointer is
 *     over it — the direction a mouse wheel actually has. Shift+wheel and any
 *     real horizontal wheel/trackpad delta pass through untouched.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let dragging = false;
    let moved = false;
    let startX = 0;
    let startScroll = 0;

    const DRAG_THRESHOLD = 4;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > DRAG_THRESHOLD) {
        moved = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add("cursor-grabbing");
      }
      if (moved) {
        el.scrollLeft = startScroll - dx;
        e.preventDefault();
      }
    };

    const endDrag = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        el.releasePointerCapture(e.pointerId);
        el.classList.remove("cursor-grabbing");
        // Swallow the click a drag-release would otherwise fire on whatever
        // sits under the cursor (a chip, a card) — a drag is not a tap.
        const swallow = (ce: MouseEvent) => {
          ce.stopPropagation();
          ce.preventDefault();
        };
        el.addEventListener("click", swallow, { capture: true, once: true });
      }
      moved = false;
    };

    const onWheel = (e: WheelEvent) => {
      // Only take over a wheel event that has nowhere else useful to go: a
      // real horizontal delta (trackpad, shift+wheel) is left alone so it
      // still does what the user expects.
      if (e.deltaX !== 0) return;
      if (el.scrollWidth <= el.clientWidth) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", endDrag);
      el.removeEventListener("pointercancel", endDrag);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  return ref;
}
