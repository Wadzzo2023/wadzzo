import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Navigation, ScanLine, Zap } from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AR_CAPTURE_RADIUS,
  bearingDegrees,
  distanceMeters,
  formatDistance,
} from "~/lib/ar/geo";
import { angleDelta } from "~/lib/ar/heading";
import { pinStatus, RARITY_META } from "~/lib/ar/rarity";
import type { ArPin, GeoFix } from "~/lib/ar/types";
import { cn } from "~/lib/utils";
import { ArButton } from "~/components/ui/ArButton";
import { RarityPlate, StatusBadge } from "~/components/ui/Badges";

/**
 * Horizontal field of view the scene is projected through, in degrees — how
 * many degrees of real turning it takes to sweep the frame edge to edge.
 *
 * This is a location-based AR: pins are placed by compass heading and GPS
 * bearing over a video backdrop, not tracked against the camera image itself
 * (no SLAM, no ARKit/ARCore world anchors). Nothing here promises the number
 * matches a real lens's optical field of view, and it deliberately doesn't
 * try to — it's a single tuning knob for how much screen a given real-world
 * turn covers. Bigger number means gentler motion for the same physical
 * turn; smaller means snappier. Started at 66, went to 100, still read as
 * too sensitive on a real device — 160 is the current value. If it ever
 * needs retuning again, this is the one line to change.
 */
const FOV = 160;
/** How near screen-centre a pin must be, in degrees, to become the target. */
const LOCK_DEGREES = 13;

/**
 * How high a pin floats relative to the phone, in metres — roughly waist
 * height against a camera held at chest height, so the negative value.
 *
 * This is what makes a pin you're standing next to sit *below* the horizon
 * while one down the street sits on it: the angle is `atan(dz / distance)`,
 * which falls off naturally with range. The previous code faked that with a
 * flat percentage offset, which meant the same drop hung at the same screen
 * height whether it was 3 m or 70 m away.
 */
const PIN_HEIGHT_OFFSET_M = -0.75;

// Shared with the heading pipeline rather than redefined — the pin
// projection, the compass strip and the sensor smoothing all have to agree
// about which way round the 0/360 seam is.
const delta = angleDelta;

export interface Placed {
  pin: ArPin;
  distance: number;
  /** Signed degrees left/right of the centre of view. */
  offset: number;
  /** Signed degrees above/below the centre of view. */
  verticalOffset: number;
  /** 0-100, horizontal screen position. */
  x: number;
  /** 0-100, vertical screen position. */
  y: number;
  size: number;
  inView: boolean;
  capturable: boolean;
}

/**
 * ── ArScene ────────────────────────────────────────────────────────────────
 *
 * Pins composited over the camera feed at their real bearings and elevations.
 *
 * Placement is a flat angular projection rather than a 3D scene. Both axes
 * are world-anchored: heading fixes a pin horizontally, the camera's pitch
 * fixes it vertically, and both use the same degrees-per-pixel scale — so a
 * pin travels across the frame at the same rate whether you pan or tilt.
 * That equality is what stops it reading as a HUD pasted on the glass.
 * Depth is carried by size and haze rather than a perspective camera, which
 * is cheaper and indistinguishable at these distances.
 *
 * (Milestone 2 swaps this projection for LocAR + three.js behind the same
 * props, which buys real 3D models and roll handling. The HUD above it —
 * reticle, billboard, radar, capture — doesn't change.)
 *
 * Targeting is a lock, not a hover: whichever pin is nearest the reticle and
 * within 13° becomes the target, its billboard opens, and Capture arms. On a
 * phone there is no cursor, so aiming *is* the pointer.
 */
export function ArScene({
  pins,
  fix,
  heading,
  elevation,
  manual,
  onDragBy,
  onCapture,
  videoEl,
  cameraLive,
  focusPinId,
  ignoreRange,
  preferPinId,
}: {
  pins: ArPin[];
  fix: GeoFix | null;
  heading: number;
  /** Degrees above the horizon the camera is aimed. */
  elevation: number;
  manual: boolean;
  onDragBy: (azimuthDeg: number, elevationDeg?: number) => void;
  onCapture: (pin: ArPin) => void;
  videoEl: React.ReactNode;
  cameraLive: boolean;
  /** Single-pin mode, reached from a collected card. */
  focusPinId?: string;
  /** Collected cards can be revisited in AR from anywhere. */
  ignoreRange?: boolean;
  /**
   * A pin to prefer once it's within the lock cone — the map handing off a
   * specific pin without hiding the rest of the scene or waiving the range
   * check the way `focusPinId` does. Only breaks a tie; aiming and range
   * still work exactly as normal.
   */
  preferPinId?: string;
}) {
  const router = useRouter();
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const [lockedId, setLockedId] = useState<string | null>(preferPinId ?? null);

  // The vertical angular scale depends on the frame's aspect ratio, which
  // differs between the desktop device shell and a real handset, so it has to
  // be measured rather than assumed.
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ w: 430, h: 850 });

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const measure = () =>
      setViewport({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Which pins exist in this scene ─────────────────────────────────────
  const scenePins = useMemo(() => {
    if (focusPinId) return pins.filter((p) => p.id === focusPinId);
    if (!fix) return [];
    return pins.filter(
      (p) => ignoreRange === true || distanceMeters(fix, p) <= AR_CAPTURE_RADIUS,
    );
  }, [pins, fix, focusPinId, ignoreRange]);

  // ── Project them ───────────────────────────────────────────────────────
  const placed = useMemo<Placed[]>(() => {
    if (!fix) return [];

    // Vertical angular scale. Using the same degrees-per-pixel as the
    // horizontal axis is what makes the scene feel world-locked rather than
    // merely animated: a pin has to travel across the screen at the same rate
    // whether you pan or tilt, or the eye reads it as sliding on the glass.
    const aspect = viewport.h / Math.max(viewport.w, 1);
    const verticalFov = FOV * aspect;

    return scenePins
      .map((pin) => {
        const distance = distanceMeters(fix, pin);
        const bearing = bearingDegrees(fix, pin);
        const offset = delta(heading, bearing);

        // Size falls off with distance but never below a tappable target.
        const size = Math.max(58, Math.min(132, 132 - distance * 0.85));

        // Where the pin sits vertically in the world, then where that lands
        // relative to wherever the camera is currently aimed.
        const pinElevation =
          (Math.atan2(PIN_HEIGHT_OFFSET_M, Math.max(distance, 1)) * 180) /
          Math.PI;
        const verticalOffset = pinElevation - elevation;

        return {
          pin,
          distance,
          offset,
          verticalOffset,
          x: 50 + (offset / FOV) * 100,
          // Screen y grows downward, so a pin above the camera axis subtracts.
          y: 50 - (verticalOffset / verticalFov) * 100,
          size,
          inView:
            Math.abs(offset) < FOV / 2 + 6 &&
            Math.abs(verticalOffset) < verticalFov / 2 + 10,
          capturable:
            pinStatus(pin) === "collectible" &&
            (ignoreRange === true || distance <= AR_CAPTURE_RADIUS),
        };
      })
      .sort((a, b) => b.distance - a.distance); // far ones paint first
  }, [scenePins, fix, heading, elevation, ignoreRange, viewport.h, viewport.w]);

  // ── Reticle lock ───────────────────────────────────────────────────────
  const target = useMemo(() => {
    // Angular distance from the reticle on both axes — aiming at the sky
    // must not keep a pin locked just because it's still dead ahead in
    // bearing. The cone is slightly taller than wide because the vertical
    // scale is coarser on a portrait frame.
    const cone = (p: Placed) =>
      Math.hypot(p.offset, p.verticalOffset * 0.6);

    const candidates = placed
      .filter((p) => cone(p) < LOCK_DEGREES)
      .sort((a, b) => cone(a) - cone(b));
    // An explicit tap wins over aim until the pin leaves the lock cone.
    const tapped = candidates.find((p) => p.pin.id === lockedId);
    return tapped ?? candidates[0] ?? null;
  }, [placed, lockedId]);

  const offscreen = placed.filter((p) => !p.inView);

  // ── Manual look-around, for anything without a compass ─────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragging.current == null) return;
      const dx = e.clientX - dragging.current.x;
      const dy = e.clientY - dragging.current.y;
      dragging.current = { x: e.clientX, y: e.clientY };

      // Drag the scene, not the camera: pull right and the world follows,
      // which means you turned left. One screen-width ≈ one FOV, on both axes
      // at the same degrees-per-pixel so a diagonal drag stays straight.
      const perDegree = viewport.w / FOV;
      onDragBy(-dx / perDegree, dy / perDegree);
    },
    [onDragBy, viewport.w],
  );

  const endDrag = useCallback(() => {
    dragging.current = null;
  }, []);

  return (
    <div
      ref={sceneRef}
      className="relative h-full w-full touch-none select-none overflow-hidden bg-black"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      {/* ── Feed ──────────────────────────────────────────────────────────
          The simulated horizon is always painted, and the camera is layered
          over it. Treating these as either/or is how you get a black screen:
          any path where a stream is granted but no frames arrive — permission
          without a device, a camera held by another app, an autoplay block —
          leaves an opaque empty <video> with nothing behind it. Stacking them
          means the worst case degrades to the simulated view instead. */}
      <SimulatedFeed heading={heading} muted={cameraLive} />
      {videoEl}

      {/* Atmosphere over whatever the feed is, so the HUD has contrast. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(3,10,6,0.72)_0%,transparent_26%,transparent_62%,rgba(3,10,6,0.88)_100%)]"
      />

      {/* ── Pins ──────────────────────────────────────────────────────── */}
      {placed
        .filter((p) => p.inView)
        .map((p) => (
          <ArPinObject
            key={p.pin.id}
            placed={p}
            targeted={target?.pin.id === p.pin.id}
            onTap={() => setLockedId(p.pin.id)}
          />
        ))}

      {/* Edge arrows for pins behind you or off to the side. */}
      {offscreen.map((p) => (
        <EdgeArrow key={p.pin.id} placed={p} />
      ))}

      {/* ── Reticle ───────────────────────────────────────────────────── */}
      <Reticle locked={Boolean(target)} armed={Boolean(target?.capturable)} />

      {/* ── Top chrome ────────────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-4"
        style={{ paddingTop: "calc(var(--ar-top-inset) + 14px)" }}
      >
        <button
          onClick={() => router.back()}
          aria-label="Leave AR"
          className="ar-glass pointer-events-auto flex h-9 items-center gap-1 rounded-full pl-1.5 pr-3 text-ar-dim"
        >
          <ChevronLeft size={17} strokeWidth={2.4} />
          <span className="font-hud text-[10px] font-semibold uppercase tracking-[0.14em]">
            Exit
          </span>
        </button>

        <ArRadar placed={placed} heading={heading} />
      </div>

      {/* Compass strip */}
      <CompassStrip heading={heading} manual={manual} />

      {/* ── Bottom chrome ─────────────────────────────────────────────── */}
      <div
        className="absolute inset-x-0 bottom-0 z-30 px-5"
        style={{ paddingBottom: "max(20px, var(--ar-safe-bottom))" }}
      >
        <AnimatePresence mode="wait">
          {target ? (
            <ArBillboard key={target.pin.id} placed={target} onCapture={onCapture} />
          ) : (
            <motion.div
              key="hint"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="ar-glass mx-auto max-w-[19rem] rounded-ar px-4 py-3 text-center"
            >
              <p className="font-hud text-[11px] font-semibold uppercase tracking-[0.14em] text-ar-green">
                {placed.length === 0
                  ? "Nothing in range"
                  : `${placed.length} drop${placed.length === 1 ? "" : "s"} around you`}
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ar-dim">
                {placed.length === 0
                  ? `Walk within ${AR_CAPTURE_RADIUS} m of a pin and it'll appear here.`
                  : manual
                    ? "Drag to look around. Line a pin up with the crosshair."
                    : "Turn until a pin sits in the crosshair."}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Scanline wash — reads as "sensor feed", and hides feed compression. */}
      <div className="ar-scanlines pointer-events-none absolute inset-0 z-20 opacity-[0.35]" />
      <div className="ar-vignette pointer-events-none absolute inset-0 z-20" />
    </div>
  );
}

// ─── Pin object ──────────────────────────────────────────────────────────────

function ArPinObject({
  placed,
  targeted,
  onTap,
}: {
  placed: Placed;
  targeted: boolean;
  onTap: () => void;
}) {
  const { pin, x, y, size, distance, capturable } = placed;
  const rarity = pin.rarity;
  const meta = RARITY_META[rarity];
  const status = pinStatus(pin);
  const dead = !capturable;

  // Distance haze. Far pins sit back in the air rather than punching through
  // it, which is most of what sells depth in a flat projection.
  const haze = Math.max(0.42, 1 - distance / (AR_CAPTURE_RADIUS * 1.5));

  return (
    // Positioning and centring stay on a plain element. The float below
    // animates `y`, and motion's inline transform would otherwise overwrite
    // Tailwind's `-translate-*` and hang every pin off its own top-left.
    <div
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}%`, top: `${y}%`, opacity: haze }}
    >
    <motion.button
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
      aria-label={`${pin.title}, ${formatDistance(distance)} away`}
      className="block"
      animate={{ y: [0, -9, 0] }}
      transition={{
        duration: 3.4,
        repeat: Infinity,
        ease: "easeInOut",
        delay: (distance % 10) / 5,
      }}
    >
      <span className="relative block" style={{ width: size, height: size }}>
        {/* Ground beam — anchors the object to a place rather than the glass */}
        <span
          aria-hidden
          className="absolute left-1/2 top-full h-[42px] w-[2px] -translate-x-1/2"
          style={{
            background: `linear-gradient(180deg, hsl(${meta.hsl}/0.75), transparent)`,
          }}
        />
        <span
          aria-hidden
          className="absolute left-1/2 top-[calc(100%+38px)] h-[10px] -translate-x-1/2 rounded-[50%]"
          style={{
            width: size * 0.62,
            background: `radial-gradient(ellipse, hsl(${meta.hsl}/0.5), transparent 70%)`,
          }}
        />

        {/* Rotating rarity ring */}
        <motion.span
          aria-hidden
          className="absolute -inset-[9%] rounded-full border-2 border-dashed"
          style={{ borderColor: `hsl(${meta.hsl} / ${dead ? 0.25 : 0.7})` }}
          animate={{ rotate: 360 }}
          transition={{ duration: dead ? 40 : 16, repeat: Infinity, ease: "linear" }}
        />

        {targeted && (
          <span
            aria-hidden
            className="animate-pulse-ring absolute -inset-[9%] rounded-full border-2"
            style={{ borderColor: `hsl(${meta.hsl})` }}
          />
        )}

        {/* The coin */}
        <motion.span
          className={cn(
            "absolute inset-0 overflow-hidden rounded-full border-[3px]",
            dead && "saturate-[0.25]",
          )}
          style={{
            borderColor: `hsl(${meta.hsl})`,
            boxShadow: targeted
              ? `0 0 0 4px hsl(${meta.hsl}/0.25), 0 0 42px 4px hsl(${meta.hsl}/0.85)`
              : `0 0 22px 0 hsl(${meta.hsl}/0.55)`,
          }}
          animate={{ scale: targeted ? 1.1 : 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 24 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pin.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="eager"
          />
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `linear-gradient(145deg, hsl(0 0% 100% / 0.28), transparent 46%, hsl(${meta.hsl}/0.35))`,
            }}
          />
          {pin.autoCollect && capturable && (
            <span className="absolute bottom-[6%] left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-ar-green text-ar-green-ink">
              <Zap size={11} strokeWidth={3.2} />
            </span>
          )}
        </motion.span>

        {/* Distance tag */}
        <span
          className="font-hud absolute -bottom-[22px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border px-2 py-[2px] text-[9px] font-bold uppercase tracking-[0.1em] backdrop-blur-sm"
          style={{
            borderColor: `hsl(${meta.hsl}/0.55)`,
            color: `hsl(${meta.hsl})`,
            background: "hsl(var(--ar-void) / 0.7)",
          }}
        >
          {status === "collected" ? "Collected" : formatDistance(distance)}
        </span>
      </span>
    </motion.button>
    </div>
  );
}

// ─── Billboard ───────────────────────────────────────────────────────────────

export function ArBillboard({
  placed,
  onCapture,
}: {
  placed: Placed;
  onCapture: (pin: ArPin) => void;
}) {
  const { pin, distance, capturable } = placed;
  const rarity = pin.rarity;
  const status = pinStatus(pin);

  return (
    <motion.div
      initial={{ opacity: 0, y: 26, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 26, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className="ar-glass mx-auto max-w-[22rem] rounded-ar-lg p-3.5"
    >
      <div className="flex items-start gap-3">
        <div className="relative h-[58px] w-[42px] shrink-0 overflow-hidden rounded-[9px] border border-ar-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pin.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <RarityPlate rarity={rarity} size="sm" />
            <StatusBadge status={status} />
          </div>
          <h2 className="font-hud truncate text-[14.5px] font-bold leading-tight text-ar-text">
            {pin.title}
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ar-faint">
            <span className="truncate">{pin.brandName}</span>
            <span aria-hidden>&middot;</span>
            <span className="font-hud shrink-0 font-bold tabular-nums text-ar-green-hot">
              {formatDistance(distance)}
            </span>
          </p>
        </div>
      </div>

      <p className="mt-2.5 line-clamp-2 text-[11.5px] leading-relaxed text-ar-dim">
        {pin.description}
      </p>

      <div className="mt-3">
        {capturable ? (
          <ArButton
            variant="primary"
            size="lg"
            block
            icon={ScanLine}
            onClick={() => onCapture(pin)}
          >
            Capture
          </ArButton>
        ) : (
          <ArButton variant="outline" size="lg" block disabled>
            {status === "collected"
              ? "Already in your collection"
              : status === "expired"
                ? "This drop has expired"
                : status === "depleted"
                  ? "All claimed"
                  : "Locked"}
          </ArButton>
        )}
      </div>
    </motion.div>
  );
}

// ─── HUD parts ───────────────────────────────────────────────────────────────

export function Reticle({ locked, armed }: { locked: boolean; armed: boolean }) {
  const color = armed
    ? "hsl(var(--ar-green-hot))"
    : locked
      ? "hsl(var(--rarity-legendary))"
      : "hsl(0 0% 100% / 0.4)";

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
    >
      <motion.svg
        viewBox="0 0 64 64"
        fill="none"
        className="h-16 w-16"
        animate={{ scale: locked ? 1 : 1.12, rotate: locked ? 0 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
      >
        {[
          "M2 20V7a5 5 0 0 1 5-5h13",
          "M44 2h13a5 5 0 0 1 5 5v13",
          "M62 44v13a5 5 0 0 1-5 5H44",
          "M20 62H7a5 5 0 0 1-5-5V44",
        ].map((d) => (
          <path
            key={d}
            d={d}
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        ))}
        <circle cx="32" cy="32" r="1.8" fill={color} />
      </motion.svg>
    </div>
  );
}

export function CompassStrip({ heading, manual }: { heading: number; manual: boolean }) {
  const marks = [0, 45, 90, 135, 180, 225, 270, 315];
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-20 h-6 overflow-hidden"
      style={{ top: "calc(var(--ar-top-inset) + 64px)" }}
    >
      <div className="relative h-full">
        {marks.map((m, i) => {
          const off = delta(heading, m);
          if (Math.abs(off) > FOV / 2 + 4) return null;
          return (
            <span
              key={m}
              className="font-hud absolute top-0 -translate-x-1/2 text-[10px] font-bold tracking-[0.16em] text-white/55"
              style={{ left: `${50 + (off / FOV) * 100}%` }}
            >
              {names[i]}
            </span>
          );
        })}
        <span className="absolute left-1/2 top-[15px] h-[6px] w-[1.5px] -translate-x-1/2 bg-ar-green-hot" />
      </div>

      {manual && (
        <span className="font-hud absolute right-4 top-0 rounded-full border border-ar-line bg-ar-void/70 px-2 py-[1px] text-[8px] font-semibold uppercase tracking-[0.14em] text-ar-faint">
          Drag to look
        </span>
      )}
    </div>
  );
}

/**
 * Top-down radar. Its job is to answer "did I miss one behind me?", which the
 * camera view structurally cannot.
 */
export function ArRadar({ placed, heading }: { placed: Placed[]; heading: number }) {
  return (
    <div className="ar-glass pointer-events-none relative h-[86px] w-[86px] shrink-0 overflow-hidden rounded-full">
      {/* Sweep */}
      <div
        className="animate-spin-slow absolute inset-0"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, hsl(var(--ar-green)/0.3) 40deg, transparent 66deg)",
        }}
      />
      <span className="absolute inset-[22%] rounded-full border border-ar-green/25" />
      <span className="absolute inset-[40%] rounded-full border border-ar-green/20" />

      {/* Field-of-view wedge, so the radar says which way you're looking. */}
      <div
        className="absolute inset-0"
        style={{
          background: `conic-gradient(from ${-FOV / 2}deg, hsl(var(--ar-green)/0.22) 0deg, hsl(var(--ar-green)/0.22) ${FOV}deg, transparent ${FOV}deg)`,
          maskImage: "radial-gradient(circle, black 62%, transparent 68%)",
          WebkitMaskImage: "radial-gradient(circle, black 62%, transparent 68%)",
        }}
      />

      {placed.map((p) => {
        // Rotate into view-relative space so "up" is always where you look.
        const rad = ((p.offset - 0) * Math.PI) / 180;
        const r = Math.min(p.distance / AR_CAPTURE_RADIUS, 1) * 36;
        const meta = RARITY_META[p.pin.rarity];
        return (
          <span
            key={p.pin.id}
            className="absolute left-1/2 top-1/2 h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              transform: `translate(calc(-50% + ${Math.sin(rad) * r}px), calc(-50% + ${-Math.cos(rad) * r}px))`,
              background: `hsl(${meta.hsl})`,
              boxShadow: `0 0 8px hsl(${meta.hsl})`,
            }}
          />
        );
      })}

      <span className="absolute left-1/2 top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_8px_white]" />
      <span className="font-hud absolute inset-x-0 bottom-[5px] text-center text-[7.5px] font-bold tabular-nums tracking-[0.1em] text-white/60">
        {Math.round(heading)}&deg;
      </span>
    </div>
  );
}

/**
 * Points at a pin that's outside the frame. Now that the scene tracks pitch,
 * a drop can be off the top or bottom as easily as off the sides — someone
 * looking at the sky with a pin at their feet needs to be told to look down,
 * not to turn around.
 *
 * Whichever axis the pin is further off on wins, so exactly one arrow shows.
 */
export function EdgeArrow({ placed }: { placed: Placed }) {
  const meta = RARITY_META[placed.pin.rarity];
  const { offset, verticalOffset } = placed;

  // Compare against each axis's own half-FOV, not raw degrees — the vertical
  // field is much taller on a portrait frame, so 20° up is a smaller miss
  // than 20° sideways.
  const horizontalMiss = Math.abs(offset) / (FOV / 2);
  const verticalMiss = Math.abs(verticalOffset) / (FOV / 2) / 1.9;
  const vertical = verticalMiss > horizontalMiss;

  const dir = vertical
    ? verticalOffset > 0
      ? "up"
      : "down"
    : offset > 0
      ? "right"
      : "left";

  const rotation = { up: 0, right: 90, down: 180, left: -90 }[dir];
  const edge = {
    up: "left-1/2 top-1.5",
    down: "left-1/2 bottom-1.5",
    left: "left-1.5 top-1/2",
    right: "right-1.5 top-1/2",
  }[dir];

  // Behind you: no edge is really right, so fade it back.
  const behind = !vertical && Math.abs(offset) > 120;

  // Centring goes through motion's own x/y — it owns the whole transform once
  // it animates any part of it, and would drop a Tailwind `-translate-*`.
  const bob = 4;
  const style = vertical
    ? { x: "-50%" as const }
    : { y: "-50%" as const };
  const animate = vertical
    ? { y: dir === "up" ? ["-50%", "-58%", "-50%"] : ["-50%", "-42%", "-50%"] }
    : { x: dir === "right" ? [0, bob, 0] : [0, -bob, 0] };

  return (
    <motion.div
      aria-hidden
      className={cn("absolute z-20", edge)}
      style={style}
      animate={{ ...animate, opacity: behind ? 0.45 : 0.85 }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-sm"
        style={{
          borderColor: `hsl(${meta.hsl}/0.6)`,
          background: "hsl(var(--ar-void)/0.6)",
        }}
      >
        <Navigation
          size={14}
          strokeWidth={2.4}
          style={{
            color: `hsl(${meta.hsl})`,
            transform: `rotate(${rotation}deg)`,
          }}
        />
      </span>
    </motion.div>
  );
}

/**
 * Stand-in for the camera when there isn't one — a desktop browser, or a
 * denied permission the viewer wants to look past. A horizon that parallaxes
 * with the heading, so turning still feels like turning.
 *
 * Always mounted, beneath the video (see the note at the feed). `muted` drops
 * its label and dims it, so when a real feed *is* playing on top this is just
 * insurance nobody ever sees rather than a second scene competing with it.
 */
function SimulatedFeed({ heading, muted }: { heading: number; muted?: boolean }) {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-[#07120c]">
      <div className="absolute inset-x-0 top-0 h-[55%] bg-[linear-gradient(180deg,#071a12_0%,#0d2a1c_58%,#17392a_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[45%] bg-[linear-gradient(180deg,#12241b_0%,#060d09_100%)]" />

      {/* A skyline that slides with the compass. */}
      <div
        className="absolute bottom-[45%] h-[130px] w-[300%]"
        style={{
          left: `${-((heading / 360) * 200) - 50}%`,
          background:
            "repeating-linear-gradient(90deg, transparent 0 34px, #0c2117 34px 62px, transparent 62px 88px, #0a1b12 88px 132px, transparent 132px 168px, #0d2419 168px 204px)",
          maskImage: "linear-gradient(180deg, transparent, black 40%)",
          WebkitMaskImage: "linear-gradient(180deg, transparent, black 40%)",
        }}
      />

      <div className="ar-grid-fine absolute inset-x-0 bottom-0 h-[45%] opacity-40" />
      {!muted && (
        <span className="font-hud absolute left-1/2 top-[30%] -translate-x-1/2 rounded-full border border-ar-line bg-ar-void/70 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-ar-faint">
          Simulated view
        </span>
      )}
    </div>
  );
}
