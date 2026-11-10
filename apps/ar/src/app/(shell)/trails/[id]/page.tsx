"use client";

import {
  Check,
  ChevronLeft,
  Footprints,
  Gift,
  Lock,
  Maximize2,
  MapPinned,
  Play,
  Share2,
  Trophy,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import MapGL, { Marker, type MapRef } from "react-map-gl/mapbox";

import { distanceMeters } from "@wadzzo/ar-core/ar/geo";
import { cn } from "@wadzzo/ui/lib/cn";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { ClaimToWallet } from "~/components/claim/ClaimToWallet";
import { DragSheet } from "~/components/directions/DragSheet";
import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { TrailMapLayer } from "~/components/trails/TrailMapLayer";
import { MapLayersButton, MapViewProbe } from "~/components/map/MapLayersSheet";
import { MapTerrain } from "~/components/map/MapTerrain";
import { TrailShape } from "~/components/trails/TrailShape";
import { ArButton } from "~/components/ui/ArButton";
import { Skeleton } from "~/components/ui/Skeleton";
import { shareLink } from "~/lib/ar/share-link";
import { useAuth } from "~/lib/ar/store";
import { mapStyleFor, useMapBase, useMapMode, useResolvedTheme } from "~/lib/ar/theme";
import {
  distanceLabel,
  MODE_VERB,
  nextStop,
  trailColor,
  useFollowTrail,
  type FanTrail,
} from "~/lib/ar/trails";
import { useGeolocation } from "~/lib/ar/useGeolocation";
import { useQueryParams, useRouter } from "~/lib/navigation";
import { api } from "~/utils/api";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API;

/**
 * ── /trails/[id] ───────────────────────────────────────────────────────────
 *
 * Map first: the route fills the screen (pan it, tap a stop), with the details in a sheet
 * you drag up, like directions. The sheet's header always holds the one thing to do next:
 * Start, Continue on the map, or Claim the reward. Stops are collected the usual way (AR,
 * auto-collect or QR); on an ordered trail each required stop waits for the one before.
 */
export default function TrailScreen() {
  const { query } = useQueryParams();
  const id = typeof query.id === "string" ? query.id : "";
  const trail = api.trails.get.useQuery({ id }, { enabled: Boolean(id), retry: false });
  const t = trail.data;

  if (!t) {
    return (
      <AppShell tabs={false}>
        <div className="flex h-full flex-col">
          <ScreenHeader back eyebrow="Trail" title={trail.isError ? "Not found" : "Loading…"} />
          <div className="space-y-3 px-5">
            {trail.isError ? (
              <p className="text-ar-dim text-[13px]">
                This trail has ended or isn&rsquo;t available.
              </p>
            ) : (
              <>
                <Skeleton className="h-[55vh] w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            )}
          </div>
        </div>
      </AppShell>
    );
  }
  return <TrailView trail={t} />;
}

function TrailView({ trail: t }: { trail: FanTrail }) {
  const router = useRouter();
  const theme = useResolvedTheme();
  const mapMode = useMapMode();
  const styleUrl = mapStyleFor(mapMode, theme, useMapBase());
  const requireAuth = useAuth((s) => s.requireAuth);
  const follow = useFollowTrail((s) => s.follow);
  const followingId = useFollowTrail((s) => s.trailId);
  const utils = api.useUtils();
  const { fix } = useGeolocation();

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  // Opens at its header (the map stays in view); drag up for the reward, About and stops.
  const [sheet, setSheet] = useState(0);
  const [thumbBroken, setThumbBroken] = useState(false);

  // Route layers mount once the style (and its Standard import) has loaded, as on directions.
  const mapRef = useRef<MapRef | null>(null);
  const styleRef = useRef(styleUrl);
  useEffect(() => {
    styleRef.current = styleUrl;
  }, [styleUrl]);
  const [loadedStyle, setLoadedStyle] = useState<string | null>(null);

  // Sheet heights follow the screen.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxH, setBoxH] = useState(760);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const snaps = [0, Math.round(boxH * 0.88)]; // 0 = fit the header
  const PEEK = 240; // about the header's height, for framing the map above it
  const sheetH = sheet === 0 ? PEEK : (snaps[1] ?? PEEK);

  const start = api.trails.start.useMutation({
    onSuccess: (next) => {
      utils.trails.get.setData({ id: t.id }, next);
      void utils.trails.mine.invalidate();
      follow(next.id);
      void router.push("/map");
    },
    onError: (e) => setError(e.message),
  });
  const claim = api.trails.claimReward.useMutation({
    onSuccess: () => {
      void utils.trails.get.invalidate({ id: t.id });
      setToast("Reward claimed");
    },
    onError: (e) => setError(e.message),
  });

  const color = trailColor(t);
  const { done, total, complete, requiredTotal } = t.progress;
  const next = nextStop(t);
  const onTrail = followingId === t.id;
  const canClaim = Boolean(complete && t.reward && !t.reward.claimed && t.reward.remaining > 0);

  const fit = useCallback(
    (bottom: number, animate = true) => {
      const b = t.bounds;
      mapRef.current?.fitBounds(
        [
          [b.minLng, b.minLat],
          [b.maxLng, b.maxLat],
        ],
        {
          padding: { top: 80, left: 44, right: 44, bottom: bottom + 36 },
          maxZoom: 16.5,
          duration: animate ? 700 : 0,
        },
      );
    },
    [t.bounds],
  );

  const focusStop = (position: number, fromMap = false) => {
    const s = t.stops.find((x) => x.position === position);
    const map = mapRef.current;
    if (!s || !map) return;
    setFocused(position);
    if (!fromMap && sheet === 1) setSheet(0);
    // From the list the sheet drops to its header; from the map it stays as it is. Centre
    // the stop in the map that's left above the sheet (an offset, so no padding sticks).
    const below = !fromMap || sheet === 0 ? PEEK : sheetH;
    map.easeTo({
      center: [s.lng, s.lat],
      zoom: Math.max(map.getZoom(), 15.5),
      offset: [0, -below / 2],
      duration: 600,
    });
    document
      .getElementById(`stop-${position}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const onPrimary = () => {
    setError(null);
    if (canClaim) return claim.mutate({ id: t.id });
    if (!requireAuth("collect")) return;
    if (t.run) {
      follow(t.id);
      void router.push("/map");
      return;
    }
    start.mutate({ id: t.id });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const won = Boolean(t.reward?.claimed && t.reward.pinId);
  const primary = complete ? (
    won ? (
      // Won: the one thing left is getting it into the wallet (or it's there already).
      <ClaimToWallet pinId={t.reward!.pinId!} />
    ) : canClaim ? (
      <ArButton
        block
        size="lg"
        variant="primary"
        icon={Trophy}
        busy={claim.isPending}
        onClick={onPrimary}
      >
        Claim your reward
      </ArButton>
    ) : (
      <div className="rounded-ar border-ar-green/40 bg-ar-green/10 text-ar-green-hot font-hud flex h-12 items-center justify-center gap-2 border text-[12px] font-bold tracking-[0.12em] uppercase">
        <Check size={16} strokeWidth={3} /> Trail complete
      </div>
    )
  ) : (
    <ArButton
      block
      size="lg"
      variant="primary"
      icon={t.run ? MapPinned : Play}
      busy={start.isPending}
      onClick={onPrimary}
    >
      {t.run ? (onTrail ? "Back to the map" : "Continue on the map") : "Start trail"}
    </ArButton>
  );

  return (
    <AppShell tabs={false}>
      <div ref={boxRef} className="relative h-full overflow-hidden select-none">
        {/* ── Map ─────────────────────────────────────────────────────── */}
        {MAPBOX_TOKEN ? (
          <MapGL
            ref={mapRef}
            mapboxAccessToken={MAPBOX_TOKEN}
            initialViewState={{
              bounds: [
                [t.bounds.minLng, t.bounds.minLat],
                [t.bounds.maxLng, t.bounds.maxLat],
              ],
              fitBoundsOptions: {
                padding: { top: 80, left: 44, right: 44, bottom: 240 + 36 },
                maxZoom: 16.5,
              },
            }}
            mapStyle={styleUrl}
            styleDiffing={false}
            attributionControl={false}
            onLoad={(e) => {
              const map = e.target;
              map.on("style.load", () => setLoadedStyle(styleRef.current));
              if (map.isStyleLoaded()) setLoadedStyle(styleRef.current);
              fit(PEEK, false);
            }}
            onClick={() => setFocused(null)}
            style={{ width: "100%", height: "100%" }}
          >
            {loadedStyle === styleUrl && <MapTerrain force={t.mode === "HIKE"} />}
            <MapViewProbe />
            {loadedStyle === styleUrl && (
              <TrailMapLayer
                trail={t}
                variant="stop"
                focused={focused}
                onStop={(p) => focusStop(p, true)}
              />
            )}
            {fix && (
              <Marker latitude={fix.lat} longitude={fix.lng} anchor="center" style={{ zIndex: 13 }}>
                <span className="relative flex size-4 items-center justify-center" aria-label="You">
                  <span className="bg-ar-green-hot/40 absolute size-8 animate-ping rounded-full" />
                  <span className="bg-ar-green-hot size-4 rounded-full border-2 border-white shadow" />
                </span>
              </Marker>
            )}
          </MapGL>
        ) : (
          <div className="ar-grid flex h-[55%] items-center justify-center">
            <TrailShape trail={t} size={260} numbers />
          </div>
        )}

        {/* ── Over the map: back, share, whole trail ──────────────────── */}
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="ar-glass text-ar-text absolute left-4 z-10 flex h-10 items-center gap-1 rounded-full pr-3.5 pl-2"
          style={{ top: "calc(var(--ar-top-inset) + 12px)" }}
        >
          <ChevronLeft size={18} strokeWidth={2.4} />
          <span className="font-hud text-[10.5px] font-semibold tracking-[0.14em] uppercase">
            Back
          </span>
        </button>
        <div
          className="absolute right-4 z-10 flex flex-col gap-2"
          style={{ top: "calc(var(--ar-top-inset) + 12px)" }}
        >
          <button
            onClick={() =>
              void shareLink(t.title, window.location.href).then(
                (r) => r === "copied" && setToast("Link copied"),
              )
            }
            aria-label="Share this trail"
            className="ar-glass text-ar-text flex size-10 items-center justify-center rounded-full"
          >
            <Share2 size={15} strokeWidth={2.2} />
          </button>
          <button
            onClick={() => {
              setFocused(null);
              fit(sheetH);
            }}
            aria-label="Show the whole trail"
            className="ar-glass text-ar-text flex size-10 items-center justify-center rounded-full"
          >
            <Maximize2 size={15} strokeWidth={2.2} />
          </button>
          <MapLayersButton className="text-ar-text size-10" />
        </div>

        {toast && (
          <div
            role="status"
            className="ar-glass font-hud text-ar-text absolute left-1/2 z-30 -translate-x-1/2 rounded-full px-4 py-2 text-[11px] font-semibold tracking-[0.1em] uppercase"
            style={{ top: "calc(var(--ar-top-inset) + 64px)" }}
          >
            {toast}
          </div>
        )}

        {/* ── The sheet ───────────────────────────────────────────────── */}
        <DragSheet
          snaps={snaps}
          index={sheet}
          onIndexChange={setSheet}
          header={
            <div className="pb-3.5">
              <div className="flex items-center gap-2">
                <BrandAvatar src={t.brand.imageUrl} className="size-6 rounded-[8px]" />
                <span className="font-hud text-ar-dim min-w-0 flex-1 truncate text-[10.5px] font-semibold tracking-[0.12em] uppercase">
                  {t.brand.name}
                </span>
                {t.runners > 0 && (
                  <span className="font-hud text-ar-faint flex items-center gap-1 text-[10.5px] font-semibold tabular-nums">
                    <Users size={11} /> {t.runners} on it
                  </span>
                )}
              </div>
              <h1 className="font-hud text-ar-text mt-1.5 text-[19px] leading-tight font-bold">
                {t.title}
              </h1>
              <div className="font-hud mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px] font-semibold">
                <Chip>{total} stops</Chip>
                <Chip>{distanceLabel(t.distanceMetres)}</Chip>
                <Chip>
                  ~{t.estMinutes} min {MODE_VERB[t.mode] ?? ""}
                </Chip>
                <Chip>{t.order === "ORDERED" ? "In order" : "Any order"}</Chip>
                {t.reward && !t.reward.claimed && t.reward.remaining > 0 && (
                  <Chip className="border-ar-green/50 text-ar-green-hot">
                    <Gift size={11} /> Reward
                  </Chip>
                )}
              </div>

              {t.run && (
                <div className="mt-3 flex items-center gap-2.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${total ? (done / total) * 100 : 0}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span className="font-hud text-ar-dim text-[11px] font-bold tabular-nums">
                    {done}/{total}
                  </span>
                </div>
              )}

              {complete && t.reward && (
                <p className="text-ar-text mt-3 flex items-center gap-1.5 text-[12.5px]">
                  <Trophy size={14} className="text-ar-green-hot shrink-0" />
                  <span className="min-w-0 truncate">
                    {won
                      ? `You finished! ${t.reward.name} is yours.`
                      : canClaim
                        ? `You finished! Claim ${t.reward.name}.`
                        : "You finished! The rewards ran out."}
                  </span>
                </p>
              )}
              <div className="mt-3">{primary}</div>
              {error && <p className="text-ar-danger mt-2 text-[12px]">{error}</p>}
            </div>
          }
        >
          {/* Reward */}
          {t.reward && (
            <section className="ar-bevel rounded-ar mb-4 p-3">
              <div className="flex items-center gap-3">
                <div className="bg-ar-green/10 flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[12px]">
                  {t.reward.thumbnail && !thumbBroken ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.reward.thumbnail}
                      alt=""
                      className="size-full object-cover"
                      onError={() => setThumbBroken(true)}
                    />
                  ) : (
                    <Gift size={22} className="text-ar-green-hot" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-hud text-ar-faint text-[9.5px] font-semibold tracking-[0.2em] uppercase">
                    Finishing reward
                  </p>
                  <p className="text-ar-text truncate text-[14px] font-semibold">{t.reward.name}</p>
                  <p className="text-ar-dim text-[11.5px]">
                    {t.reward.claimed
                      ? "You won it: it's yours to keep"
                      : t.reward.remaining > 0
                        ? `${t.reward.remaining} of ${t.reward.limit} left · finish ${requiredTotal < total ? "the required stops" : "every stop"} to win`
                        : "All claimed"}
                  </p>
                </div>
              </div>
            </section>
          )}

          {t.description && (
            <section className="mb-4">
              <h2 className="font-hud text-ar-green mb-1.5 text-[9.5px] font-semibold tracking-[0.24em] uppercase">
                About
              </h2>
              <p className="text-ar-dim text-[13px] leading-relaxed whitespace-pre-line">
                {t.description}
              </p>
            </section>
          )}

          {/* Stops */}
          <h2 className="font-hud text-ar-green mb-2 flex items-center gap-1.5 text-[9.5px] font-semibold tracking-[0.24em] uppercase">
            <Footprints size={11} /> Stops
            <span className="text-ar-faint ml-auto tracking-[0.06em] normal-case">
              {t.order === "ORDERED" ? "Each one unlocks the next" : "Collect in any order"}
            </span>
          </h2>
          <ol className="space-y-2 pb-4">
            {t.stops.map((s) => {
              const away = fix ? distanceMeters(fix, s) : null;
              const isNext = next?.position === s.position && !complete;
              const dim = (Boolean(s.lockReason) || s.unavailable) && !s.done;
              return (
                <li key={s.position} id={`stop-${s.position}`}>
                  <button
                    type="button"
                    onClick={() => focusStop(s.position)}
                    className={cn(
                      "rounded-ar flex w-full items-center gap-3 border p-2 text-left transition-colors",
                      focused === s.position
                        ? "border-ar-green/60 bg-ar-green/10"
                        : isNext
                          ? "border-ar-green/30 bg-white/[0.03]"
                          : "border-white/5 bg-white/[0.02]",
                    )}
                  >
                    <span
                      className={cn(
                        "font-hud flex size-[30px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white",
                        dim && "opacity-60",
                      )}
                      style={{
                        backgroundColor: s.done
                          ? "#16a34a"
                          : s.required
                            ? color
                            : "rgba(255,255,255,0.2)",
                      }}
                    >
                      {s.done ? <Check size={14} strokeWidth={3} /> : s.position}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.imageUrl}
                      alt=""
                      className={cn(
                        "size-11 shrink-0 rounded-[12px] object-cover",
                        dim && "opacity-60 grayscale",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-[13.5px] font-semibold",
                          dim ? "text-ar-dim" : "text-ar-text",
                        )}
                      >
                        {s.title}
                        {!s.required && (
                          <span className="font-hud text-ar-faint ml-1.5 text-[9.5px] tracking-[0.1em] uppercase">
                            Bonus
                          </span>
                        )}
                      </p>
                      <p
                        className={cn(
                          "flex items-center gap-1 truncate text-[11.5px]",
                          s.done ? "text-ar-green-hot" : isNext ? "text-ar-text" : "text-ar-dim",
                        )}
                      >
                        {s.done ? (
                          "Collected"
                        ) : s.unavailable ? (
                          "No longer available"
                        ) : s.lockReason ? (
                          <>
                            <Lock size={10} /> {s.lockReason}
                          </>
                        ) : (
                          (s.clue ?? (isNext ? "Next up" : "Ready to collect"))
                        )}
                      </p>
                    </div>
                    {away !== null && !s.done && (
                      <span className="font-hud text-ar-faint shrink-0 text-[10.5px] font-semibold tabular-nums">
                        {distanceLabel(away)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </DragSheet>
      </div>
    </AppShell>
  );
}

function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "border-ar-line text-ar-dim flex items-center gap-1 rounded-full border px-2 py-0.5 tabular-nums",
        className,
      )}
    >
      {children}
    </span>
  );
}
