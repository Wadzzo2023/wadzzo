"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Frame, CalendarDays, ExternalLink, LocateFixed, Lock, Minus, Navigation, Plus, Target, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmbedMap, type EmbedMapHandle, type Viewport } from "~/components/embed/EmbedMap";
import type { MapMural } from "~/components/map/MuralMarker";
import { MapSearch, MapSearchButton } from "~/components/map/MapSearch";
import { RarityPlate } from "~/components/ui/Badges";
import { distanceMeters, formatDistance } from "~/lib/ar/geo";
import { applyTheme, setMapMode, useMapMode } from "~/lib/ar/theme";
import type { ArPin, ArPinType, Coords, GeoFix } from "~/lib/ar/types";
import {
  accentVars,
  brandFilter,
  type EmbedConfig,
  type EmbedEvent,
  normalizeConfig,
  PIN_TYPE_LABEL,
} from "~/lib/embed/config";
import { cn } from "@wadzzo/ui/lib/cn";
import { api } from "~/utils/api";
import { platformBranding } from "@wadzzo/platform/branding";

// ── The embed ─────────────────────────────────────────────────────────────

function useEmbedTheme(theme: EmbedConfig["theme"]) {
  useEffect(() => {
    if (theme !== "AUTO") {
      applyTheme(theme === "DARK" ? "dark" : "light");
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyTheme(mq.matches ? "dark" : "light");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}

function track(id: string, e: EmbedEvent) {
  if (id === "preview") return;
  const body = JSON.stringify({ id, e });
  try {
    if (!navigator.sendBeacon?.("/api/embed/track", body)) {
      void fetch("/api/embed/track", { method: "POST", body, keepalive: true });
    }
  } catch {
    // Counting is best-effort.
  }
}

/**
 * Preview mode only (brand-wadzzo's editor frames `/embed/preview`):
 *  - settings arrive as `{ type: "wadzzo-embed:config", config }` messages, so
 *    editing a field updates the map in place instead of reloading it;
 *  - every settled view goes back up as `{ type: "wadzzo-embed:view", … }`,
 *    which the editor offers as "Set start view here".
 * Messages are accepted only from brand-wadzzo's origins.
 */
function usePreviewBridge(initial: EmbedConfig, origins: string[] | undefined) {
  const [config, setConfig] = useState(initial);
  useEffect(() => {
    if (!origins) return;
    const onMessage = (e: MessageEvent) => {
      if (!origins.includes(e.origin)) return;
      const data = e.data as { type?: string; config?: Record<string, unknown> } | null;
      if (data?.type === "wadzzo-embed:config" && data.config) setConfig(normalizeConfig(data.config, "preview"));
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "wadzzo-embed:ready" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, [origins]);
  return config;
}

export function EmbedClient({ initialConfig, previewOrigins }: { initialConfig: EmbedConfig; previewOrigins?: string[] }) {
  const config = usePreviewBridge(initialConfig, previewOrigins);
  useEmbedTheme(config.theme);
  const mapRef = useRef<EmbedMapHandle>(null);
  const mapMode = useMapMode();
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchPin, setSearchPin] = useState<ArPin | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<ArPinType | null>(null);
  const [me, setMe] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => track(config.id, "view"), [config.id]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // Area query, rounded so a nudge of the map reuses the cached answer, with
  // a 15% margin so pins just off-screen are already there when you pan.
  // `pins.list` caps the radius at 2000 km; a view wider than that (a whole
  // country) drops the area and asks for every live pin instead — `{}`.
  const MAX_RADIUS_KM = 2000;
  const radiusKm = viewport ? Math.ceil(viewport.radiusKm * 1.15) : 0;
  const area = viewport
    ? radiusKm > MAX_RADIUS_KM
      ? {}
      : {
          lat: Math.round(viewport.center.lat * 1000) / 1000,
          lng: Math.round(viewport.center.lng * 1000) / 1000,
          radiusKm,
        }
    : null;
  const pinsQuery = api.pins.list.useQuery(
    {
      ...(area ?? {}),
      types: config.pinTypes.length ? config.pinTypes : undefined,
      brandId: brandFilter(config),
    },
    { enabled: area != null, placeholderData: keepPreviousData, staleTime: 60_000 },
  );
  const allPins = useMemo(() => pinsQuery.data ?? [], [pinsQuery.data]);
  const pins = useMemo(
    () => (typeFilter ? allPins.filter((p) => p.type === typeFilter) : allPins),
    [allPins, typeFilter],
  );
  const presentTypes = useMemo(() => {
    const seen = new Set(allPins.map((p) => p.type));
    return (Object.keys(PIN_TYPE_LABEL) as ArPinType[]).filter((t) => seen.has(t));
  }, [allPins]);

  const selected = pins.find((p) => p.id === selectedId) ?? (searchPin?.id === selectedId ? searchPin : null);

  // ── Murals (approved only; plan §7) ───────────────────────────────────
  // Same viewport as the pins, as a box, rounded to ~1 km so pans reuse it.
  // Skipped when zoomed far out — the map hides them there anyway.
  const MURAL_MAX_RADIUS_KM = 40;
  const muralBox =
    config.showMurals && viewport && viewport.radiusKm <= MURAL_MAX_RADIUS_KM
      ? (() => {
          const r = viewport.radiusKm * 1.15;
          const dLat = r / 111;
          const dLng = r / (111 * Math.max(0.01, Math.cos((viewport.center.lat * Math.PI) / 180)));
          const up = (v: number) => Math.ceil(v * 100) / 100;
          const down = (v: number) => Math.floor(v * 100) / 100;
          return {
            north: up(viewport.center.lat + dLat),
            south: down(viewport.center.lat - dLat),
            east: up(viewport.center.lng + dLng),
            west: down(viewport.center.lng - dLng),
          };
        })()
      : null;
  const muralsQuery = api.murals.inArea.useQuery(
    { ...(muralBox ?? { north: 0, south: 0, east: 0, west: 0 }), includeUnverified: false },
    { enabled: muralBox != null, placeholderData: keepPreviousData, staleTime: 60_000 },
  );
  const murals = config.showMurals ? (muralsQuery.data?.murals ?? []) : [];
  const [selectedMuralId, setSelectedMuralId] = useState<string | null>(null);
  const selectedMural = murals.find((m) => m.id === selectedMuralId) ?? null;
  const origin = me ?? viewport?.center ?? { lat: config.centerLat, lng: config.centerLng };
  const nearby = useMemo(
    () => [...pins].sort((a, b) => distanceMeters(origin, a) - distanceMeters(origin, b)).slice(0, 20),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pins, origin.lat, origin.lng],
  );

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      setSelectedMuralId(null);
      if (!id) return;
      track(config.id, "pinTap");
      const pin = pins.find((p) => p.id === id);
      if (pin) mapRef.current?.flyToPin(pin);
    },
    [pins, config.id],
  );

  const locate = () => {
    if (!navigator.geolocation) return setNotice("Location isn't available in this browser");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(c);
        mapRef.current?.flyTo(c, 14);
      },
      (err) => {
        setLocating(false);
        setNotice(
          err.code === err.PERMISSION_DENIED
            ? "Location is blocked — allow it in your browser to see drops near you"
            : "Couldn't find your location",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const meFix: GeoFix | null = me ? { ...me, accuracy: 0, heading: null, speed: null, timestamp: 0 } : null;
  // Relative on purpose: links in the iframe resolve against wadzzoAR, not
  // the host site, and the markup matches between server and client.
  const openUrl = (pin: ArPin) => `/collection/${encodeURIComponent(pin.id)}?ref=embed-${config.id}`;
  const links = [
    config.eventsUrl && { key: "events" as const, label: config.eventsLabel, url: config.eventsUrl, icon: CalendarDays },
    config.bountiesUrl && { key: "bounties" as const, label: config.bountiesLabel, url: config.bountiesUrl, icon: Target },
  ].filter(Boolean) as { key: "events" | "bounties"; label: string; url: string; icon: typeof Target }[];

  return (
    <div
      className="relative flex h-screen w-screen overflow-hidden bg-ar-bg text-ar-text"
      style={{ ...accentVars(config.accentColor), ["--ar-top-inset" as string]: "0px" }}
    >
      {/* ── Side list (wide embeds) ─────────────────────────────────── */}
      {config.showNearby && (
        <aside className="hidden w-[290px] shrink-0 flex-col border-r border-ar-line bg-ar-surface md:flex">
          <div className="border-b border-ar-line px-4 py-3">
            <p className="font-hud text-[10px] font-semibold uppercase tracking-[0.22em] text-ar-green">
              {me ? "Near you" : "In view"}
            </p>
            <p className="text-[12px] text-ar-faint">
              {pinsQuery.isLoading ? "Loading drops…" : `${pins.length} drop${pins.length === 1 ? "" : "s"} on the map`}
            </p>
          </div>
          <ul className="ar-scroll flex-1 divide-y divide-ar-line">
            {nearby.map((p) => (
              <li key={p.id}>
                <NearbyRow pin={p} distance={distanceMeters(origin, p)} active={p.id === selectedId} onClick={() => select(p.id)} />
              </li>
            ))}
            {!pinsQuery.isLoading && nearby.length === 0 && (
              <li className="px-4 py-8 text-center text-[12px] text-ar-faint">No drops here — try zooming out.</li>
            )}
          </ul>
        </aside>
      )}

      {/* ── Map ─────────────────────────────────────────────────────── */}
      <div className="relative flex-1">
        <EmbedMap
          ref={mapRef}
          pins={pins}
          initial={{ center: { lat: config.centerLat, lng: config.centerLng }, zoom: config.zoom }}
          cooperative={config.gestureMode === "COOPERATIVE"}
          selectedId={selectedId}
          onSelect={select}
          onViewport={(v) => {
            setViewport(v);
            if (previewOrigins) {
              window.parent.postMessage(
                { type: "wadzzo-embed:view", lat: v.center.lat, lng: v.center.lng, zoom: v.zoom },
                "*",
              );
            }
          }}
          me={me}
          murals={murals}
          selectedMuralId={selectedMuralId}
          onSelectMural={(id) => {
            setSelectedId(null);
            setSelectedMuralId(id);
            track(config.id, "pinTap");
          }}
        />

        {/* Top bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-2 p-3">
          {config.showSearch && <MapSearchButton onClick={() => setSearchOpen(true)} className="pointer-events-auto" />}
          {config.showFilterChips && presentTypes.length > 1 && (
            <div className="ar-scroll-x pointer-events-auto flex min-w-0 gap-1.5">
              <FilterChip active={typeFilter == null} onClick={() => setTypeFilter(null)}>All</FilterChip>
              {presentTypes.map((t) => (
                <FilterChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? null : t)}>
                  {PIN_TYPE_LABEL[t]}
                </FilterChip>
              ))}
            </div>
          )}
          <div className="pointer-events-auto ml-auto flex flex-col gap-2">
            {config.userLocation && (
              <RoundButton label="Show drops near me" onClick={locate} active={me != null}>
                <LocateFixed size={16} className={cn(locating && "animate-pulse")} />
              </RoundButton>
            )}
            <RoundButton label={`Switch to the ${mapMode === "3d" ? "2D" : "3D"} map`} onClick={() => setMapMode(mapMode === "3d" ? "2d" : "3d")}>
              <span className="font-hud text-[10px] font-bold">{mapMode === "3d" ? "2D" : "3D"}</span>
            </RoundButton>
            <RoundButton label="Zoom in" onClick={() => mapRef.current?.zoomBy(1)}>
              <Plus size={16} />
            </RoundButton>
            <RoundButton label="Zoom out" onClick={() => mapRef.current?.zoomBy(-1)}>
              <Minus size={16} />
            </RoundButton>
          </div>
        </div>

        {notice && (
          <div className="ar-glass absolute left-1/2 top-14 z-40 max-w-[85%] -translate-x-1/2 rounded-2xl px-4 py-2 text-center text-[12px] text-ar-text">
            {notice}
          </div>
        )}

        {/* Bottom: nearby strip (narrow), links, attribution */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 p-3">
          {config.showNearby && nearby.length > 0 && !selected && !selectedMural && (
            <div className="ar-scroll-x pointer-events-auto -mx-3 flex gap-2 px-3 md:hidden">
              {nearby.slice(0, 12).map((p) => (
                <button
                  key={p.id}
                  onClick={() => select(p.id)}
                  className="ar-glass flex w-[210px] shrink-0 items-center gap-2.5 rounded-2xl p-2 text-left"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-semibold">{p.title}</span>
                    <span className="block truncate text-[11px] text-ar-faint">
                      {formatDistance(distanceMeters(origin, p))} · {p.brandName}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {selectedMural && (
            <MuralPreviewCard
              mural={selectedMural}
              distance={me ? distanceMeters(me, { lat: selectedMural.latitude, lng: selectedMural.longitude }) : null}
              openUrl={`/murals/${encodeURIComponent(selectedMural.id)}?ref=embed-${config.id}`}
              onOpen={() => track(config.id, "open")}
              onClose={() => setSelectedMuralId(null)}
            />
          )}

          {selected && (
            <PreviewCard
              pin={selected}
              distance={me ? distanceMeters(me, selected) : null}
              openUrl={openUrl(selected)}
              onOpen={() => track(config.id, "open")}
              onClose={() => setSelectedId(null)}
            />
          )}

          <div className="flex items-end justify-between gap-2">
            <div className="pointer-events-auto flex flex-wrap gap-2">
              {links.map((l) => (
                <a
                  key={l.key}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track(config.id, l.key)}
                  className="ar-key ar-key-primary font-hud inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[11px] font-bold uppercase tracking-[0.08em]"
                >
                  <l.icon size={14} strokeWidth={2.4} />
                  {l.label}
                </a>
              ))}
            </div>
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="ar-glass pointer-events-auto shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold text-ar-dim hover:text-ar-text"
            >
              Powered by <span className="text-ar-green-hot">{platformBranding.name}</span>
            </a>
          </div>
        </div>

        <MapSearch
          brandId={brandFilter(config)}
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          fix={meFix}
          onPickPin={(pin) => {
            setTypeFilter(null);
            setSearchPin(pin);
            setSelectedId(pin.id);
            track(config.id, "pinTap");
            mapRef.current?.flyToPin(pin);
          }}
          onPickPlace={(c) => {
            setSelectedId(null);
            mapRef.current?.flyTo(c, 14);
          }}
        />
      </div>
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

/** A mural's card: public cover only, like everywhere outside the admin. */
function MuralPreviewCard({
  mural,
  distance,
  openUrl,
  onOpen,
  onClose,
}: {
  mural: MapMural;
  distance: number | null;
  openUrl: string;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ar-glass pointer-events-auto relative w-full overflow-hidden rounded-3xl md:ml-auto md:w-[360px]">
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-ar-void/60 text-white"
      >
        <X size={15} />
      </button>
      <div className="flex gap-3 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mural.coverUrl} alt="" className="h-[96px] w-[78px] shrink-0 rounded-2xl border-2 border-rarity-epic object-cover" />
        <div className="min-w-0 flex-1 pr-6">
          <p className="font-hud flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-rarity-epic">
            <Frame size={10} strokeWidth={2.6} /> Mural
          </p>
          <p className="line-clamp-2 text-[14.5px] font-semibold leading-snug">{mural.title}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-ar-dim">
            {mural.artist ? `by ${mural.artist}` : "Street art"}
          </p>
          <p className="mt-1.5 text-[11px] text-ar-faint">
            {distance != null ? `${formatDistance(distance)} away · ` : ""}
            Scan it with the {platformBranding.name} camera to earn coins
          </p>
        </div>
      </div>
      <div className="flex gap-2 px-3 pb-3">
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onOpen}
          className="ar-key ar-key-primary font-hud flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[12px] font-bold uppercase tracking-[0.08em]"
        >
          Open in {platformBranding.name} <ExternalLink size={14} strokeWidth={2.4} />
        </a>
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${mural.latitude},${mural.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Directions"
          className="ar-key flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ar-text"
        >
          <Navigation size={15} />
        </a>
      </div>
    </div>
  );
}

function PreviewCard({
  pin,
  distance,
  openUrl,
  onOpen,
  onClose,
}: {
  pin: ArPin;
  distance: number | null;
  openUrl: string;
  onOpen: () => void;
  onClose: () => void;
}) {
  const ends = pin.endsAt ? new Date(pin.endsAt) : null;
  return (
    <div className="ar-glass pointer-events-auto relative w-full overflow-hidden rounded-3xl md:ml-auto md:w-[360px]">
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-ar-void/60 text-white"
      >
        <X size={15} />
      </button>
      <div className="flex gap-3 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pin.imageUrl} alt="" className="h-[84px] w-[84px] shrink-0 rounded-2xl object-cover" />
        <div className="min-w-0 flex-1 pr-6">
          <p className="font-hud text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ar-green">
            {PIN_TYPE_LABEL[pin.type].replace(/s$/, "")}
          </p>
          <p className="line-clamp-2 text-[14.5px] font-semibold leading-snug">{pin.title}</p>
          <div className="mt-1 flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pin.brandImageUrl} alt="" className="h-4 w-4 rounded-full object-cover" />
            <span className="truncate text-[11.5px] text-ar-dim">{pin.brandName}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ar-faint">
            <RarityPlate rarity={pin.rarity} size="sm" />
            {distance != null && <span>{formatDistance(distance)} away</span>}
            {ends && ends > new Date() && <span>Ends in {formatDistanceToNowStrict(ends)}</span>}
          </div>
        </div>
      </div>
      {pin.locked && pin.lockReason && (
        <p className="mx-3 mb-2 flex items-center gap-1.5 rounded-xl bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] text-ar-dim">
          <Lock size={12} className="shrink-0" /> {pin.lockReason}
        </p>
      )}
      <div className="flex gap-2 px-3 pb-3">
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onOpen}
          className="ar-key ar-key-primary font-hud flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[12px] font-bold uppercase tracking-[0.08em]"
        >
          Open in {platformBranding.name} <ExternalLink size={14} strokeWidth={2.4} />
        </a>
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Directions"
          className="ar-key flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ar-text"
        >
          <Navigation size={15} />
        </a>
      </div>
    </div>
  );
}

function NearbyRow({ pin, distance, active, onClick }: { pin: ArPin; distance: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ar-green/[0.06]", active && "bg-ar-green/[0.1]")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pin.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{pin.title}</span>
        <span className="block truncate text-[11px] text-ar-faint">{pin.brandName}</span>
      </span>
      <span className="font-hud shrink-0 text-[10.5px] font-bold tabular-nums text-ar-dim">{formatDistance(distance)}</span>
    </button>
  );
}

function FilterChip({ children, active, onClick }: { children: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "font-hud h-9 shrink-0 rounded-full border px-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] backdrop-blur-md",
        active ? "border-ar-green/70 bg-ar-green/25 text-ar-text" : "border-ar-line bg-ar-surface/80 text-ar-dim hover:text-ar-text",
      )}
    >
      {children}
    </button>
  );
}

function RoundButton({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "ar-glass flex h-9 w-9 items-center justify-center rounded-full",
        active ? "text-ar-green-hot" : "text-ar-dim hover:text-ar-text",
      )}
    >
      {children}
    </button>
  );
}
