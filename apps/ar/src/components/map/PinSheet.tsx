import {
  Bike,
  Bus,
  Car,
  Navigation,
  Package,
  ScanLine,
  Timer,
  Footprints,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  AR_CAPTURE_RADIUS,
  compassPoint,
  bearingDegrees,
  distanceMeters,
  formatDistance,
  travelMinutes,
} from "~/lib/ar/geo";
import { pinStatus, timeRemaining } from "~/lib/ar/rarity";
import type { ArPin, GeoFix, TravelMode } from "~/lib/ar/types";
import { cn } from "@wadzzo/ui/lib/cn";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import {
  DETECTION_META,
  DetectionBadge,
  RarityPlate,
  StatusBadge,
} from "~/components/ui/Badges";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { BrandAvatar } from "~/components/brand/BrandAvatar";

const MODES: { id: TravelMode; icon: typeof Bike; label: string }[] = [
  { id: "walk", icon: Footprints, label: "Walk" },
  { id: "cycle", icon: Bike, label: "Cycle" },
  { id: "transit", icon: Bus, label: "Transit" },
  { id: "drive", icon: Car, label: "Drive" },
];

/**
 * The pin detail sheet. Everything needed to decide "is this worth walking
 * to?" without leaving the map: what it is, how rare, how far, how long it'll
 * take by each mode, how many are left, and when it dies.
 *
 * The primary action changes with proximity, and that's the whole point of
 * the screen — inside 75 m it's Capture, outside it's Directions. Showing a
 * dead Capture button to someone 400 m away just teaches them the button
 * doesn't work.
 */
export function PinSheet({
  pin,
  fix,
  onClose,
  onCapture,
  onDirections,
}: {
  pin: ArPin | null;
  fix: GeoFix | null;
  onClose: () => void;
  onCapture: (pin: ArPin) => void;
  onDirections: (pin: ArPin, mode: TravelMode) => void;
}) {
  const [mode, setMode] = useState<TravelMode>("walk");

  return (
    <BottomSheet open={Boolean(pin)} onClose={onClose} labelledBy="pin-sheet-title">
      {pin && (
        <PinSheetBody
          pin={pin}
          fix={fix}
          mode={mode}
          setMode={setMode}
          onCapture={onCapture}
          onDirections={onDirections}
        />
      )}
    </BottomSheet>
  );
}

function PinSheetBody({
  pin,
  fix,
  mode,
  setMode,
  onCapture,
  onDirections,
}: {
  pin: ArPin;
  fix: GeoFix | null;
  mode: TravelMode;
  setMode: (m: TravelMode) => void;
  onCapture: (pin: ArPin) => void;
  onDirections: (pin: ArPin, mode: TravelMode) => void;
}) {
  const rarity = pin.rarity;
  const status = pinStatus(pin);
  const ends = timeRemaining(pin.endsAt);

  const distance = fix ? distanceMeters(fix, pin) : null;
  const bearing = fix ? bearingDegrees(fix, pin) : null;
  const inRange = distance != null && distance <= AR_CAPTURE_RADIUS;
  const detection = DETECTION_META[pin.detection];

  return (
    <div className="ar-scroll max-h-[76vh] px-5 pb-3 pt-2">
      {/* ── Head ─────────────────────────────────────────────────────── */}
      <div className="flex gap-3.5">
        <div className="relative h-[92px] w-[66px] shrink-0 overflow-hidden rounded-[11px] border border-ar-line bg-ar-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pin.imageUrl}
            alt=""
            className={cn(
              "h-full w-full object-cover",
              (status === "expired" || status === "depleted") &&
                "saturate-0 brightness-50",
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <RarityPlate rarity={rarity} size="sm" />
            <StatusBadge status={status} />
          </div>

          <h2
            id="pin-sheet-title"
            className="font-hud text-[17px] font-bold leading-tight text-ar-text"
          >
            {pin.title}
          </h2>

          <Link
            href={`/brands/${pin.brandId}`}
            className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-ar-dim transition-colors hover:text-ar-text"
          >
            <BrandAvatar
              src={pin.brandImageUrl}
              className="h-4 w-4 rounded-full ring-1 ring-white/15"
            />
            <span className="truncate">{pin.brandName}</span>
          </Link>
        </div>
      </div>

      <p className="mt-3.5 text-[13px] leading-relaxed text-ar-dim">
        {pin.description}
      </p>

      {/* ── Facts ────────────────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Fact
          icon={Navigation}
          label="Distance"
          value={distance != null ? formatDistance(distance) : "—"}
          sub={bearing != null ? compassPoint(bearing) : undefined}
          accent={inRange}
        />
        <Fact
          icon={Package}
          label="Left"
          value={pin.remaining > 0 ? String(pin.remaining) : "0"}
          // Uncapped drops have no denominator to count against.
          sub={pin.supply != null ? `of ${pin.supply.toLocaleString()}` : "Open drop"}
        />
        <Fact
          icon={Timer}
          label="Window"
          value={ends ? ends.label.replace(" left", "") : "Open"}
          sub={ends ? undefined : "No end date"}
          danger={ends?.urgent}
        />
      </div>

      {/* ── How you claim it ─────────────────────────────────────────── */}
      <div className="mt-3 flex items-start gap-2.5 rounded-ar border border-ar-line bg-white/[0.03] p-3">
        <DetectionBadge method={pin.detection} className="mt-[1px] shrink-0" />
        <p className="text-[11.5px] leading-relaxed text-ar-faint">
          {detection.hint}
        </p>
      </div>

      {/* ── Travel ───────────────────────────────────────────────────── */}
      {distance != null && !inRange && status !== "collected" && (
        <div className="mt-4">
          <p className="font-hud mb-2 text-[9.5px] font-semibold uppercase tracking-[0.22em] text-ar-faint">
            Getting there
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {MODES.map(({ id, icon: Icon, label }) => {
              const active = mode === id;
              return (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-[12px] border px-1 py-2 transition-colors",
                    active
                      ? "border-ar-green/60 bg-ar-green/12 text-ar-green-hot"
                      : "border-ar-line bg-white/[0.03] text-ar-faint hover:text-ar-dim",
                  )}
                >
                  <Icon size={16} strokeWidth={2.1} />
                  <span className="font-hud text-[12px] font-bold tabular-nums leading-none">
                    {travelMinutes(distance, id)}
                    <span className="text-[8.5px] font-medium"> min</span>
                  </span>
                  <span className="font-hud text-[8px] uppercase tracking-[0.12em]">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Actions ──────────────────────────────────────────────────── */}
      <div className="mt-5 space-y-2">
        {status === "collected" ? (
          <ArLinkButton
            href={`/collection/${pin.id}`}
            variant="gold"
            size="lg"
            block
            icon={Package}
          >
            View your collectible
          </ArLinkButton>
        ) : status === "collectible" && inRange ? (
          <ArButton
            variant="primary"
            size="lg"
            block
            icon={ScanLine}
            onClick={() => onCapture(pin)}
          >
            Capture in AR
          </ArButton>
        ) : status === "collectible" ? (
          <>
            <ArButton
              variant="primary"
              size="lg"
              block
              icon={Navigation}
              onClick={() => onDirections(pin, mode)}
            >
              Directions &middot; {formatDistance(distance ?? 0)}
            </ArButton>
            <p className="text-center text-[11px] text-ar-faint">
              Get within {AR_CAPTURE_RADIUS} m to capture this one.
            </p>
          </>
        ) : (
          <>
            <ArButton variant="outline" size="lg" block disabled>
              {status === "locked" ? "Locked" : "No longer available"}
            </ArButton>
            {/* A locked pin is only worth showing if it also says what would
                unlock it — otherwise it's a dead end on the map. */}
            {status === "locked" && pin.lockReason && (
              <p className="text-center text-[11px] text-ar-faint">
                {pin.lockReason}
              </p>
            )}
          </>
        )}

        <ArLinkButton
          href={`/brands/${pin.brandId}`}
          variant="ghost"
          size="md"
          block
        >
          More from {pin.brandName}
        </ArLinkButton>
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  danger,
}: {
  icon: typeof Navigation;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-ar border border-ar-line bg-white/[0.03] px-2.5 py-2.5",
        accent && "border-ar-green/45 bg-ar-green/[0.08]",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 text-ar-faint">
        <Icon size={11} strokeWidth={2.4} />
        <span className="font-hud text-[8.5px] font-semibold uppercase tracking-[0.16em]">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "font-hud text-[14px] font-bold leading-none tabular-nums",
          accent ? "text-ar-green-hot" : danger ? "text-ar-danger" : "text-ar-text",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[9.5px] text-ar-faint">{sub}</p>}
    </div>
  );
}
