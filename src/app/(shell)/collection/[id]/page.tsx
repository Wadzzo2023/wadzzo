"use client";

import { motion } from "framer-motion";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  Hash,
  MapPin,
  ScanLine,
  Share2,
  Ticket,
  Check,
  BadgeCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useQueryParams, useRouter } from "~/lib/navigation";
import { useMemo, useState } from "react";
import QRCode from "react-qr-code";
import MapGL, { Marker } from "react-map-gl/mapbox";

import { ArPhotoFrame } from "~/components/ar/ArPhotoFrame";
import { ClaimToWallet } from "~/components/claim/ClaimToWallet";
import { HoloCard } from "~/components/cards/HoloCard";
import { PackOpening } from "~/components/cards/PackOpening";
import { AppShell } from "~/components/shell/AppShell";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import {
  Chip,
  DETECTION_META,
  DetectionBadge,
  RarityPlate,
  StatusBadge,
} from "~/components/ui/Badges";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { Skeleton, SkeletonText } from "~/components/ui/Skeleton";
import { pinStatus, RARITY_META, timeRemaining } from "~/lib/ar/rarity";
import { MAP_STYLE, useResolvedTheme, useThemeRead } from "~/lib/ar/theme";
import { useAuth } from "~/lib/ar/store";
import { useDragScroll } from "~/lib/ar/useDragScroll";
import {
  useBrandsQuery,
  usePinsQuery,
  useToggleFollow,
} from "~/lib/ar/usePins";
import type { ArBrand, ArPin } from "~/lib/ar/types";
import { cn } from "~/lib/utils";
import { BrandAvatar } from "~/components/brand/BrandAvatar";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API;

const compact = (n: number) =>
  n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);

const dateFmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

/**
 * ── /collection/[id] ───────────────────────────────────────────────────────
 *
 * One card, in full. This is where someone lands straight after a capture, so
 * it has to answer every question the celebration didn't: what did I just
 * get, how rare is it, where was I, and how do I actually spend it.
 *
 * The brief called for enough depth here that a collector never has to open
 * the main Wadzzo webapp to understand what they hold — so provenance
 * (where, when, by which method), scarcity (serial out of supply), and
 * redemption (code plus scannable QR) are all on this one screen rather than
 * behind links.
 */
export default function CollectionDetail() {
  const router = useRouter();
  const { query: urlQuery, ready: urlReady } = useQueryParams();
  const theme = useResolvedTheme();
  const themeRead = useThemeRead();
  const id = typeof urlQuery.id === "string" ? urlQuery.id : null;

  const { pins, isLoading: pinsLoading } = usePinsQuery();
  const { brands } = useBrandsQuery();
  const {
    toggle: toggleFollow,
    pendingId: followPendingId,
    labelFor: followLabel,
  } = useToggleFollow();
  const signedIn = useAuth((s) => Boolean(s.user));
  const requireAuth = useAuth((s) => s.requireAuth);

  const [redeemOpen, setRedeemOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const siblingRailRef = useDragScroll<HTMLDivElement>();

  const pin = useMemo(() => pins.find((p) => p.id === id) ?? null, [pins, id]);
  const brand = useMemo(
    () => (pin ? (brands.find((b) => b.id === pin.brandId) ?? null) : null),
    [brands, pin],
  );

  const siblings = useMemo(
    () =>
      pin
        ? pins
            .filter((p) => p.brandId === pin.brandId && p.id !== pin.id)
            .slice(0, 6)
        : [],
    [pins, pin],
  );

  // "Collectible not found" is a claim, and during the first fetch it's a false one —
  // the pin list simply hasn't arrived. Show the card's silhouette instead and
  // only assert absence once there's actually an answer.
  if (pinsLoading) {
    return (
      <AppShell>
        <div
          className="ar-scroll h-full px-5"
          role="status"
          aria-label="Loading collectible"
        >
          <div className="mx-auto mt-16 max-w-[236px]">
            <Skeleton className="aspect-[3/4] w-full" rounded="rounded-ar-lg" />
          </div>
          <div className="mx-auto mt-6 flex max-w-[260px] flex-col items-center gap-2.5">
            <Skeleton rounded="rounded-full" className="h-3 w-24" />
            <Skeleton rounded="rounded-full" className="h-5 w-full" />
            <Skeleton rounded="rounded-full" className="h-3 w-32" />
          </div>
          <SkeletonText lines={3} className="mx-auto mt-7 max-w-[300px]" />
          <div className="mt-7 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  if (!pin) {
    return (
      <AppShell>
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="font-hud text-[15px] font-bold uppercase tracking-[0.12em] text-ar-dim">
            Collectible not found
          </p>
          <ArLinkButton href="/collection" variant="primary" size="md">
            Back to collection
          </ArLinkButton>
        </div>
      </AppShell>
    );
  }

  const rarity = pin.rarity;
  const meta = RARITY_META[rarity];
  const status = pinStatus(pin);
  const ends = timeRemaining(pin.endsAt);
  const detection = DETECTION_META[pin.detection];
  // Deterministic serial from the id, so it's stable across renders. The real
  // one comes from the LocationConsumer row's claim order. An uncapped drop
  // has nothing to number against, so it gets no serial at all.
  const serial =
    pin.supply != null
      ? (Array.from(pin.id).reduce((a, c) => a + c.charCodeAt(0), 0) %
          pin.supply) +
        1
      : null;

  const copyCode = async () => {
    if (!pin.redeemCode) return;
    try {
      await navigator.clipboard.writeText(pin.redeemCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_800);
    } catch {
      /* clipboard blocked — the code is on screen regardless */
    }
  };

  return (
    <AppShell>
      <div className="ar-scroll relative h-full">
        {/* Rarity wash behind the hero */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[440px]"
          style={{
            background: `radial-gradient(110% 70% at 50% 8%, hsl(${meta.hsl}/0.3), transparent 68%)`,
          }}
        />

        {/* ── Bar ──────────────────────────────────────────────────── */}
        {/* The bar is sticky, so the card and its copy scroll underneath it —
            and underneath the status bar above that. A dark scrim fading to
            transparent keeps both readable without flattening the rarity wash
            behind the hero. */}
        <div
          className="sticky top-0 z-30 flex items-center justify-between bg-linear-to-b from-ar-void via-ar-void/85 to-transparent px-4 pb-6"
          style={{ paddingTop: "calc(var(--ar-top-inset) + 14px)" }}
        >
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="ar-glass flex h-9 items-center gap-1 rounded-full pl-1.5 pr-3 text-ar-dim"
          >
            <ChevronLeft size={17} strokeWidth={2.4} />
            <span className="font-hud text-[10px] font-semibold uppercase tracking-[0.14em]">
              Back
            </span>
          </button>
          <button
            aria-label="Share this collectible"
            onClick={() => {
              void navigator
                .share?.({ title: pin.title, text: pin.description })
                .catch(() => undefined);
            }}
            className="ar-glass flex h-9 w-9 items-center justify-center rounded-full text-ar-dim"
          >
            <Share2 size={15} strokeWidth={2.2} />
          </button>
        </div>

        {/* ── Hero card ────────────────────────────────────────────── */}
        <div className="relative px-8 pb-1 pt-2">
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 26 }}
            className="mx-auto max-w-[264px]"
          >
            {/* Sealed until tapped. Keyed by pin id so each card is opened
                once per session — the ritual is the point the first time and
                an obstacle every time after. */}
            <PackOpening rarity={rarity} openedKey={pin.id}>
              <HoloCard
                pin={pin}
                brand={brand}
                creatorBack
                interactive
                priority
                showFlipButton
              />
            </PackOpening>
          </motion.div>

          <p className="font-hud mt-3.5 text-center text-[9px] uppercase tracking-[0.22em] text-ar-faint">
            Tilt to foil &bull; Tap Creator for the issuer
          </p>
        </div>

        {/* ── Identity ─────────────────────────────────────────────── */}
        <div className="relative px-5 pt-4">
          <div className="mb-2.5 flex flex-wrap items-center justify-center gap-1.5">
            <RarityPlate rarity={rarity} />
            <StatusBadge status={status} />
            <DetectionBadge method={pin.detection} />
          </div>

          <h1 className="font-hud text-center text-[23px] font-bold leading-tight text-ar-text">
            {pin.title}
          </h1>

          <p className="mt-2.5 text-center text-[13px] leading-relaxed text-ar-dim">
            {pin.description}
          </p>

          {/* This drop's own tags. Optional-chained rather than assumed: the
              field is new, and a pin cached by an older client predates it. */}
          {pin.tags?.length ? (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {pin.tags.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </div>
          ) : null}

          <div className="mt-3.5 flex items-center justify-center gap-2">
            <Link
              href={`/brands/${pin.brandId}`}
              className="ar-glass flex items-center gap-2 rounded-full py-1 pl-1.5 pr-3 text-[12px] text-ar-dim transition-colors hover:text-ar-text"
            >
              <BrandAvatar
                src={brand?.avatarUrl ?? pin.brandImageUrl}
                className="h-5 w-5 rounded-full ring-1 ring-white/15"
              />
              <span className="font-medium text-ar-text">{pin.brandName}</span>
              {brand?.verified && (
                <BadgeCheck
                  size={13}
                  strokeWidth={2.4}
                  className="text-ar-green-hot"
                />
              )}
            </Link>

            <ArButton
              size="sm"
              variant={brand?.followed ? "outline" : "primary"}
              onClick={() => {
                if (!requireAuth("follow")) return;
                toggleFollow(brand ?? { id: pin.brandId, followed: false });
              }}
              busy={followPendingId === pin.brandId}
              className="h-7 rounded-full px-3 text-[10.5px]"
            >
              {brand?.followed
                ? "Following"
                : followLabel(brand ?? { id: pin.brandId, followed: false })}
            </ArButton>
          </div>
        </div>

        {/* ── Actions ──────────────────────────────────────────────── */}
        <div className="mt-6 space-y-2 px-5">
          {/* Single-item viewing — any pin, collected or not — never needed
              the GPS/compass discovery scene at all: there's nothing to walk
              toward, only something to look at. `ArPhotoFrame` builds a
              picture frame around the art and hands it to the platform's
              own AR (WebXR / Scene Viewer / Quick Look), no range check, no
              location fix, so anyone browsing from a brand's profile can
              view a pin here too, not just its owner.
              Actually *capturing* an uncollected pin still has to run the
              real proximity/lock/eligibility logic, which only the live
              scene at `/ar` does — that's a separate action below, not
              this one. */}
          <ArPhotoFrame imageUrl={pin.imageUrl} accentHsl={meta.hsl} />
          <p className="text-center text-[11px] leading-relaxed text-ar-faint">
            {pin.collected
              ? "It's yours — point your camera at a surface to place it in AR."
              : "Anyone can view it in AR from here — no distance limit."}
          </p>

          {!pin.collected && (
            <ArLinkButton
              href={`/ar?target=${pin.id}`}
              variant="outline"
              size="lg"
              block
              icon={ScanLine}
            >
              Capture in AR
            </ArLinkButton>
          )}

          {pin.collected && <ClaimToWallet pinId={pin.id} />}

          {pin.collected && pin.redeemCode && (
            <ArButton
              variant="gold"
              size="lg"
              block
              icon={Ticket}
              onClick={() => {
                if (!requireAuth("redeem")) return;
                setRedeemOpen(true);
              }}
              disabled={pin.isRedeemed === true}
            >
              {pin.isRedeemed ? "Already redeemed" : "Show redeem code"}
            </ArButton>
          )}
        </div>

        {/* ── Provenance ───────────────────────────────────────────── */}
        <section className="mt-7 px-5">
          <SectionTitle>Provenance</SectionTitle>
          <div className="ar-bevel divide-y divide-ar-line rounded-ar">
            <Row
              icon={Calendar}
              label="Collected"
              value={signedIn && pin.collected ? dateFmt(pin.collectedAt) : "—"}
            />
            {serial != null && pin.supply != null && (
              <Row
                icon={Hash}
                label="Serial"
                value={
                  <>
                    <span style={{ color: `hsl(${meta.hsl})` }}>
                      #{serial.toLocaleString()}
                    </span>
                    <span className="text-ar-faint">
                      {" "}
                      / {pin.supply.toLocaleString()}
                    </span>
                  </>
                }
              />
            )}
            <Row
              icon={detection.icon}
              label="Claimed by"
              value={detection.label}
            />
            <Row
              icon={Ticket}
              label="Drop window"
              value={ends ? ends.label : "No end date"}
              danger={ends?.urgent}
            />
            <Row
              icon={MapPin}
              label="Remaining"
              value={
                pin.supply != null
                  ? `${pin.remaining.toLocaleString()} of ${pin.supply.toLocaleString()}`
                  : pin.remaining.toLocaleString()
              }
            />
          </div>
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-ar-faint">
            {meta.blurb}. {detection.hint}
          </p>
        </section>

        {/* ── Where ────────────────────────────────────────────────── */}
        <section className="mt-6 px-5">
          <SectionTitle>Where you found it</SectionTitle>
          <div className="relative h-[168px] overflow-hidden rounded-ar border border-ar-line">
            {MAPBOX_TOKEN ? (
              themeRead && <MapGL
                mapboxAccessToken={MAPBOX_TOKEN}
                initialViewState={{
                  longitude: pin.lng,
                  latitude: pin.lat,
                  zoom: 15.4,
                  pitch: 40,
                }}
                mapStyle={MAP_STYLE[theme]}
                attributionControl={false}
                interactive={false}
                style={{ width: "100%", height: "100%" }}
              >
                <Marker longitude={pin.lng} latitude={pin.lat} anchor="center">
                  <span
                    className="block h-4 w-4 rounded-full border-2"
                    style={{
                      borderColor: `hsl(${meta.hsl})`,
                      background: `hsl(${meta.hsl}/0.35)`,
                      boxShadow: `0 0 18px hsl(${meta.hsl})`,
                    }}
                  />
                </Marker>
              </MapGL>
            ) : (
              <div className="ar-grid flex h-full items-center justify-center bg-ar-surface">
                <MapPin size={22} className="text-ar-faint" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_90%_at_50%_50%,transparent_40%,hsl(var(--ar-void)/0.8)_100%)]" />
            <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between">
              <span className="font-hud rounded-full border border-ar-line bg-ar-void/80 px-2.5 py-1 text-[9.5px] font-semibold tabular-nums tracking-[0.1em] text-ar-dim">
                {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
              </span>
              <Link
                href={`/map?focus=${pin.id}`}
                className="font-hud rounded-full border border-ar-green/50 bg-ar-green/15 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-ar-green-hot"
              >
                On the map
              </Link>
            </div>
          </div>
        </section>

        {/* ── Sibling drops ────────────────────────────────────────── */}
        {siblings.length > 0 && (
          <section className="mt-6">
            <div className="px-5">
              <SectionTitle>More from {pin.brandName}</SectionTitle>
            </div>
            <div
              ref={siblingRailRef}
              className="ar-scroll-x flex gap-3.5 px-5 pb-2"
            >
              {siblings.map((s) => (
                <div key={s.id} className="card-rail-item">
                  {/* `oneFace`: these are links to other drops, not objects to
                      inspect in place — there's nothing worth flipping to, and
                      the card back that normally stands in while art loads just
                      read as the whole row being the wrong cards for a beat. */}
                  <HoloCard
                    pin={s}
                    oneFace
                    onClick={() => void router.push(`/collection/${s.id}`)}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="h-8" />
      </div>

      {/* ── Redeem sheet ───────────────────────────────────────────── */}
      <BottomSheet
        open={redeemOpen}
        onClose={() => setRedeemOpen(false)}
        labelledBy="redeem-title"
      >
        <div className="px-6 pb-4 pt-3 text-center">
          <h2
            id="redeem-title"
            className="font-hud text-[19px] font-bold text-ar-text"
          >
            Show this at the counter
          </h2>
          <p className="mx-auto mt-1.5 max-w-[18rem] text-[12.5px] leading-relaxed text-ar-dim">
            {pin.brandName} scans the code, or types it in. It only works once.
          </p>

          <div className="mx-auto mt-5 w-fit rounded-ar-lg bg-white p-3.5">
            <QRCode
              value={pin.redeemCode ?? ""}
              size={168}
              bgColor="#ffffff"
              fgColor="#07120c"
            />
          </div>

          <button
            onClick={copyCode}
            className="ar-bevel mx-auto mt-4 flex items-center gap-2.5 rounded-ar px-4 py-2.5"
          >
            <span className="font-hud text-[17px] font-bold tracking-[0.14em] text-ar-text">
              {pin.redeemCode}
            </span>
            {copied ? (
              <Check size={15} strokeWidth={3} className="text-ar-green-hot" />
            ) : (
              <Copy size={15} strokeWidth={2.2} className="text-ar-faint" />
            )}
          </button>
          <p className="mt-2 text-[10.5px] text-ar-faint">
            {copied ? "Copied to clipboard" : "Tap the code to copy it"}
          </p>
        </div>
      </BottomSheet>
    </AppShell>
  );
}

function CreatorInfoCard({
  pin,
  brand,
  onToggleFollow,
  followBusy = false,
  followLabel = "Follow",
}: {
  pin: ArPin;
  brand: ArBrand | null;
  onToggleFollow: () => void;
  followBusy?: boolean;
  followLabel?: string;
}) {
  return (
    <div className="ar-bevel relative overflow-hidden rounded-ar border border-ar-line/70 bg-linear-to-b from-ar-surface-2/90 to-ar-surface p-3.5 shadow-md">
      {/* Brand cover bleed in background */}
      {brand?.coverUrl && (
        <div className="pointer-events-none absolute inset-0 opacity-[0.14]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brand.coverUrl}
            alt=""
            className="h-full w-full object-cover blur-[2px]"
          />
        </div>
      )}

      <div className="relative flex items-center justify-between gap-3">
        <Link
          href={`/brands/${pin.brandId}`}
          className="group flex min-w-0 flex-1 items-center gap-3"
        >
          <div className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={brand?.avatarUrl ?? pin.brandImageUrl}
              alt={pin.brandName}
              className="h-11 w-11 rounded-[13px] object-cover ring-2 ring-white/15 transition-transform group-hover:scale-105"
            />
            {brand?.verified && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-ar-surface-3 ring-1 ring-ar-line">
                <BadgeCheck
                  size={11}
                  strokeWidth={2.6}
                  className="text-ar-green-hot"
                />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <span className="font-hud block text-[7.5px] font-bold uppercase tracking-[0.2em] text-ar-faint">
              CREATOR
            </span>
            <h3 className="truncate text-[13.5px] font-bold leading-snug text-ar-text transition-colors group-hover:text-ar-green-hot">
              {pin.brandName}
            </h3>
            {brand?.tagline ? (
              <p className="truncate text-[11px] text-ar-dim">
                {brand.tagline}
              </p>
            ) : (
              <p className="truncate text-[11px] text-ar-faint">
                @{brand?.handle ?? "creator"}
              </p>
            )}
          </div>
        </Link>

        {/* Action: Follow button & Link */}
        <div className="flex shrink-0 items-center gap-1.5">
          <ArButton
            size="sm"
            variant={brand?.followed ? "outline" : "primary"}
            onClick={onToggleFollow}
            busy={followBusy}
            className="h-8 px-3 text-[11px]"
          >
            {brand?.followed ? "Following" : followLabel}
          </ArButton>
          <Link
            href={`/brands/${pin.brandId}`}
            aria-label="View creator page"
            className="ar-glass flex h-8 w-8 items-center justify-center rounded-full text-ar-faint transition-colors hover:text-ar-text"
          >
            <ChevronRight size={15} strokeWidth={2.4} />
          </Link>
        </div>
      </div>

      {/* Stats row */}
      {brand && (
        <div className="relative mt-2.5 flex items-center gap-3.5 border-t border-white/5 pt-2 text-[10px] text-ar-dim">
          <span className="font-hud flex items-center gap-1 font-semibold tabular-nums">
            <Users size={11} className="text-ar-faint" />
            <strong className="text-ar-text">
              {compact(brand.followers)}
            </strong>{" "}
            followers
          </span>
          <span className="font-hud flex items-center gap-1 font-semibold tabular-nums">
            <MapPin size={11} className="text-ar-faint" />
            <strong className="text-ar-text">{brand.pinCount}</strong> drops
          </span>
          {brand.region && (
            <span className="font-hud ml-auto truncate uppercase tracking-wider text-ar-faint">
              {brand.region}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-hud mb-2.5 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ar-faint">
      {children}
    </h2>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  danger,
}: {
  icon: typeof MapPin;
  label: string;
  value: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-3">
      <span className="flex items-center gap-2.5 text-ar-faint">
        <Icon size={14} strokeWidth={2.1} />
        <span className="font-hud text-[10.5px] font-semibold uppercase tracking-[0.12em]">
          {label}
        </span>
      </span>
      <span
        className={cn(
          "font-hud text-right text-[12.5px] font-bold tabular-nums",
          danger ? "text-ar-danger" : "text-ar-text",
        )}
      >
        {value}
      </span>
    </div>
  );
}
