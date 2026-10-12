import { Coins, Frame, HelpCircle, Navigation, ScanLine, Sparkles } from "lucide-react";

import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { distanceMeters, formatDistance } from "@wadzzo/ar-core/ar/geo";
import type { GeoFix } from "@wadzzo/ar-core/ar/types";
import { api } from "~/utils/api";
import { cn } from "@wadzzo/ui/lib/cn";

import type { MapMural } from "./MuralMarker";

/** Close enough to scan from the sheet (the server's own radius is 75 m). */
const SCAN_FROM_M = 100;

/**
 * ── MuralSheet ─────────────────────────────────────────────────────────────
 *
 * Tap a mural frame on the map. Only the public cover is shown — other
 * people's scan photos never are (plan §12.6). Close enough → "Scan this
 * mural" opens the camera; otherwise the distance and directions. Unverified
 * murals say so and invite people to help verify them.
 */
export function MuralSheet({
  mural,
  dailyLimit,
  fix,
  onClose,
}: {
  mural: MapMural | null;
  dailyLimit: number;
  fix: GeoFix | null;
  onClose: () => void;
}) {
  const detail = api.murals.byId.useQuery(
    { id: mural?.id ?? "" },
    { enabled: Boolean(mural), staleTime: 30_000 },
  );
  const mine = detail.data?.mine;

  const distance =
    mural && fix ? distanceMeters(fix, { lat: mural.latitude, lng: mural.longitude }) : null;
  const near = distance != null && distance <= SCAN_FROM_M;
  const verified = mural?.status === "APPROVED";
  const atLimit = mural ? mural.scansToday >= dailyLimit : false;

  return (
    <BottomSheet open={Boolean(mural)} onClose={onClose} labelledBy="mural-sheet-title">
      {mural && (
        <div className="ar-scroll max-h-[80vh] overflow-y-auto">
          <div className="flex gap-4 px-5 pt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mural.coverUrl}
              alt=""
              className={cn(
                "h-[118px] w-[94px] shrink-0 rounded-[12px] border-2 object-cover",
                verified ? "border-rarity-epic" : "border-rarity-epic/80 border-dashed",
              )}
            />
            <div className="min-w-0 flex-1">
              <span
                className={cn(
                  "font-hud inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[9.5px] font-bold tracking-[0.14em] uppercase",
                  verified
                    ? "border-ar-green/50 text-ar-green-hot"
                    : "border-rarity-epic/50 text-rarity-epic",
                )}
              >
                {verified ? (
                  <Frame size={10} strokeWidth={2.6} />
                ) : (
                  <HelpCircle size={10} strokeWidth={2.6} />
                )}
                {verified ? "Mural" : "Unverified"}
              </span>
              <h2
                id="mural-sheet-title"
                className="font-hud text-ar-text mt-1.5 text-[17px] leading-tight font-bold"
              >
                {mural.title}
              </h2>
              <p className="text-ar-dim mt-0.5 truncate text-[12px]">
                {mural.artist
                  ? `by ${mural.artist}`
                  : mural.autoTitled
                    ? "Not named yet"
                    : "Artist unknown"}
              </p>
              <p className="text-ar-faint mt-2 text-[11.5px]">
                {distance != null ? `${formatDistance(distance)} away · ` : ""}
                {mural.scanCount.toLocaleString()} scan
                {mural.scanCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {!verified && (
            <div className="rounded-ar border-rarity-epic/35 bg-rarity-epic/10 mx-5 mt-4 flex items-center gap-3 border px-3.5 py-2.5">
              <Sparkles size={16} strokeWidth={2.3} className="text-rarity-epic shrink-0" />
              <p className="text-ar-text text-[12px] leading-snug">
                {mural.distinctScanners < mural.confirmationsNeeded ? (
                  <>
                    <b>Help verify it</b> — {mural.distinctScanners} of {mural.confirmationsNeeded}{" "}
                    finders so far. Early finders earn a discovery bonus.
                  </>
                ) : (
                  <>Found by enough people — waiting for review. You can still collect it.</>
                )}
              </p>
            </div>
          )}

          {mine && (
            <div className="mx-5 mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label="Today" value={`${mine.scansToday}/${mine.dailyLimit}`} />
              <Stat label="Your scans" value={String(mine.totalScans)} />
              <Stat label="Coins here" value={mine.coinsEarned.toLocaleString()} icon />
            </div>
          )}

          <div className="space-y-2 px-5 pt-4 pb-1">
            {atLimit ? (
              <p className="rounded-ar border-ar-line text-ar-dim border px-3 py-2.5 text-center text-[12px]">
                You&apos;ve scanned this {dailyLimit}× today — back after midnight.
              </p>
            ) : near ? (
              <ArLinkButton
                href={`/murals?target=${mural.id}`}
                variant="primary"
                size="lg"
                block
                icon={ScanLine}
              >
                Scan this mural
              </ArLinkButton>
            ) : (
              <ArButton variant="outline" size="lg" block disabled>
                {distance != null
                  ? `Get closer · ${formatDistance(distance)}`
                  : "Turn on location to scan"}
              </ArButton>
            )}
            {!near && (
              <ArLinkButton
                variant="ghost"
                size="md"
                block
                icon={Navigation}
                href={`/directions/${mural.id}?kind=mural`}
              >
                Directions
              </ArLinkButton>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: boolean }) {
  return (
    <div className="rounded-ar border-ar-line border bg-white/[0.03] px-2 py-2">
      <p
        className={cn(
          "font-hud flex items-center justify-center gap-1 text-[15px] font-bold",
          icon ? "text-gold" : "text-ar-text",
        )}
      >
        {icon && <Coins size={13} strokeWidth={2.5} />}
        {value}
      </p>
      <p className="text-ar-faint mt-0.5 text-[9.5px] tracking-[0.12em] uppercase">{label}</p>
    </div>
  );
}
