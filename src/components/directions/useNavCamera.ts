import { useEffect, useRef, type RefObject } from "react";
import type { MapRef } from "react-map-gl";

/**
 * ── useNavCamera ───────────────────────────────────────────────────────────
 *
 * The navigation camera, driven frame-by-frame instead of by `easeTo`.
 *
 * The old camera issued a 600 ms `easeTo` on every compass/GPS update, so
 * each one interrupted the last (stutter) and every call re-asserted zoom
 * 17.6 (pinching "broke" the compass: the next update yanked the zoom back).
 *
 * Here a requestAnimationFrame loop eases a current position + heading
 * toward the latest target (exponential smoothing, shortest way round for
 * angles) and `jumpTo`s only centre + bearing — never zoom, so the zoom you
 * left it at sticks. It also positions the overlay arrow / compass
 * dial in screen space every frame, so they glide instead of hopping between
 * GPS fixes.
 */

export type Orientation = "heading" | "north";

const POS_TAU = 0.55; // s — GPS fixes come every 1–2 s; glide between them
const BEARING_TAU = 0.18; // s — compass is already smoothed; stay responsive

const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

export function useNavCamera({
  mapRef,
  active,
  following,
  orientation,
  target,
  arrowRef,
  dialRef,
  needleRef,
}: {
  mapRef: RefObject<MapRef | null>;
  /** Navigation on: the loop runs and owns the camera while `following`. */
  active: boolean;
  following: boolean;
  orientation: Orientation;
  /** Latest wanted position `[lng, lat]` and travel/compass heading. */
  target: { pos: [number, number]; heading: number } | null;
  /** Overlay arrow (absolutely positioned, origin centre). */
  arrowRef: RefObject<HTMLElement | null>;
  /** Optional compass dial centred on the user (HUD style). */
  dialRef?: RefObject<HTMLElement | null>;
  /** Compass-button needle; rotated to show north. */
  needleRef?: RefObject<HTMLElement | null>;
}) {
  const tgt = useRef(target);
  tgt.current = target;
  const opts = useRef({ following, orientation });
  opts.current = { following, orientation };
  const cur = useRef<{ lng: number; lat: number; heading: number } | null>(null);

  useEffect(() => {
    if (!active) {
      cur.current = null;
      return;
    }
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const map = mapRef.current?.getMap();
      const t = tgt.current;
      if (!map || !t) return;

      const c = (cur.current ??= { lng: t.pos[0], lat: t.pos[1], heading: t.heading });
      const ap = 1 - Math.exp(-dt / POS_TAU);
      const ab = 1 - Math.exp(-dt / BEARING_TAU);
      c.lng += (t.pos[0] - c.lng) * ap;
      c.lat += (t.pos[1] - c.lat) * ap;
      c.heading = (c.heading + wrap(t.heading - c.heading) * ab + 360) % 360;

      const { following: f, orientation: o } = opts.current;
      // Don't fight the start/re-centre fly-in. (Any user gesture stops following altogether.)
      if (f && !map.isEasing() && !map.isMoving()) {
        // Compass off ("north"): leave the bearing wherever the user / the compass button put it.
        map.jumpTo(o === "heading" ? { center: [c.lng, c.lat], bearing: c.heading } : { center: [c.lng, c.lat] });
      }

      const mb = map.getBearing();
      const p = map.project([c.lng, c.lat]);
      if (arrowRef.current) arrowRef.current.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${c.heading - mb}deg)`;
      if (dialRef?.current) dialRef.current.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${-mb}deg)`;
      if (needleRef?.current) needleRef.current.style.transform = `rotate(${-mb}deg)`;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, mapRef, arrowRef, dialRef, needleRef]);
}
