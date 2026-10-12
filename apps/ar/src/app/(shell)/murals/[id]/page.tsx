"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
  Check,
  Coins,
  Frame,
  Navigation,
  PencilLine,
  ScanLine,
  ShieldX,
  Sparkles,
} from "lucide-react";
import { useQueryParams, useRouter } from "~/lib/navigation";
import { useState } from "react";

import { NameMuralSheet } from "~/components/murals/NameMuralSheet";
import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { Skeleton } from "~/components/ui/Skeleton";
import { venueMapImage } from "~/lib/ar/events";
import { useResolvedTheme } from "~/lib/ar/theme";
import type { MuralStatus } from "@wadzzo/ar-core/murals/constants";
import { cn } from "@wadzzo/ui/lib/cn";
import { api } from "~/utils/api";

/**
 * ── /murals/[id] ───────────────────────────────────────────────────────────
 *
 * One mural from Collection › Murals. The header photo is the viewer's own
 * latest scan if they have one, else the public cover. Status reads as a
 * three-step timeline (Found → In review → Verified), then the viewer's
 * stats, their scan history with their own photos, and the next action.
 */

const STEPS: { key: MuralStatus; label: string }[] = [
  { key: "DISCOVERED", label: "Found" },
  { key: "PENDING", label: "In review" },
  { key: "APPROVED", label: "Verified" },
];
const ORDER: Record<MuralStatus, number> = {
  DISCOVERED: 0,
  PENDING: 1,
  APPROVED: 2,
  REJECTED: -1,
};

export default function MuralDetailScreen() {
  const router = useRouter();
  const { query: urlQuery, ready: urlReady } = useQueryParams();
  const id = typeof urlQuery.id === "string" ? urlQuery.id : "";
  const q = api.murals.byId.useQuery({ id }, { enabled: Boolean(id) });
  const theme = useResolvedTheme();
  const [naming, setNaming] = useState(false);
  const token = process.env.NEXT_PUBLIC_MAPBOX_API;

  const data = q.data;
  const mural = data?.mural;
  const mine = data?.mine;
  const photo = mine?.history[0]?.keyframes[1] ?? mural?.coverUrl;
  const step = mural ? ORDER[mural.status] : 0;

  return (
    <AppShell tabs={false}>
      <div className="ar-scroll h-full pb-10">
        <ScreenHeader back eyebrow="Mural" title={mural?.title ?? "Mural"} />

        {q.isLoading ? (
          <div className="space-y-3 px-5">
            <Skeleton className="rounded-ar-lg aspect-[4/5] w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !mural ? (
          <div className="px-5 pt-10 text-center">
            <ShieldX size={28} className="text-ar-faint mx-auto" />
            <p className="font-hud text-ar-text mt-3 text-[15px] font-bold">
              This mural isn&apos;t available
            </p>
            <ArLinkButton
              href="/collection?tab=murals"
              variant="outline"
              size="md"
              className="mt-4"
            >
              Back to your murals
            </ArLinkButton>
          </div>
        ) : (
          <div className="space-y-4 px-5">
            {/* ── Photo ─────────────────────────────────────────────── */}
            <div className="rounded-ar-lg border-rarity-epic/70 relative overflow-hidden border-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo}
                alt=""
                className={cn(
                  "aspect-[4/5] w-full object-cover",
                  mural.status === "REJECTED" && "grayscale",
                )}
              />
              {mine?.rank != null && (
                <span className="font-hud bg-ar-void/80 text-rarity-epic absolute top-3 left-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] uppercase">
                  <Sparkles size={11} strokeWidth={2.6} />
                  {mine.rank === 1 ? "You discovered it" : `Finder #${mine.rank}`}
                </span>
              )}
            </div>

            <div>
              <p className="text-ar-dim text-[13px]">
                {mural.artist
                  ? `by ${mural.artist}`
                  : mural.autoTitled
                    ? "Not named yet"
                    : "Artist unknown"}
              </p>
              {mine?.canName && (
                <ArButton
                  variant="outline"
                  size="sm"
                  icon={PencilLine}
                  className="mt-2"
                  onClick={() => setNaming(true)}
                >
                  Name this mural
                </ArButton>
              )}
            </div>

            {/* ── Status ────────────────────────────────────────────── */}
            {mural.status === "REJECTED" ? (
              <div className="rounded-ar border-ar-danger/40 bg-ar-danger/10 text-ar-text border px-4 py-3 text-[12.5px]">
                Not collectable — reviewers decided this isn&apos;t a mural. You keep the coins you
                earned.
              </div>
            ) : (
              <div className="rounded-ar border-ar-line border bg-white/[0.03] px-4 py-3.5">
                <ol className="flex items-center">
                  {STEPS.map((s, i) => {
                    const done = i <= step;
                    return (
                      <li key={s.key} className="flex flex-1 items-center last:flex-none">
                        <span className="flex flex-col items-center">
                          <span
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-full border-2",
                              done
                                ? "border-rarity-epic bg-rarity-epic text-white"
                                : "border-ar-line text-ar-faint",
                            )}
                          >
                            {done ? (
                              <Check size={12} strokeWidth={3} />
                            ) : (
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            )}
                          </span>
                          <span
                            className={cn(
                              "font-hud mt-1 text-[9.5px] font-bold tracking-[0.12em] uppercase",
                              done ? "text-ar-text" : "text-ar-faint",
                            )}
                          >
                            {s.label}
                          </span>
                        </span>
                        {i < STEPS.length - 1 && (
                          <span
                            className={cn(
                              "mx-1 mb-4 h-[2px] flex-1",
                              i < step ? "bg-rarity-epic" : "bg-ar-line",
                            )}
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>
                {mural.status === "DISCOVERED" && (
                  <p className="text-ar-dim mt-2.5 text-center text-[11.5px]">
                    {mural.distinctScanners} of {mural.confirmationsNeeded} finders — it goes to
                    review after that.
                  </p>
                )}
              </div>
            )}

            {/* ── Your numbers ─────────────────────────────────────── */}
            {mine && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Today" value={`${mine.scansToday}/${mine.dailyLimit}`} />
                <Stat label="Your scans" value={String(mine.totalScans)} />
                <Stat label="Coins" value={mine.coinsEarned.toLocaleString()} gold />
              </div>
            )}

            {/* ── Where ────────────────────────────────────────────── */}
            {token && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${mural.latitude},${mural.longitude}&travelmode=walking`}
                target="_blank"
                rel="noreferrer"
                className="rounded-ar border-ar-line relative block overflow-hidden border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={venueMapImage(mural.latitude, mural.longitude, token, theme, {
                    w: 600,
                    h: 220,
                  })}
                  alt="Map"
                  className="h-[150px] w-full object-cover"
                />
                <span className="ar-glass font-hud text-ar-text absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] uppercase">
                  <Navigation size={11} strokeWidth={2.6} /> Directions
                </span>
              </a>
            )}

            {mural.status !== "REJECTED" && (
              <ArLinkButton
                href={`/murals?target=${mural.id}`}
                variant="primary"
                size="lg"
                block
                icon={ScanLine}
              >
                Scan it again
              </ArLinkButton>
            )}

            {/* ── History ──────────────────────────────────────────── */}
            {mine && mine.history.length > 0 && (
              <div>
                <p className="font-hud text-ar-dim mb-2 text-[11px] font-bold tracking-[0.14em] uppercase">
                  Your scans
                </p>
                <ul className="space-y-2">
                  {mine.history.map((h) => (
                    <li
                      key={h.id}
                      className="rounded-ar border-ar-line flex items-center gap-3 border p-2"
                    >
                      <span className="flex gap-1">
                        {h.keyframes.map((k) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={k}
                            src={k}
                            alt=""
                            loading="lazy"
                            className="h-11 w-9 rounded-[6px] object-cover"
                          />
                        ))}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-ar-text block text-[12.5px]">
                          {format(new Date(h.createdAt), "MMM d · p")}
                        </span>
                        <span className="text-ar-faint block text-[10.5px]">
                          {formatDistanceToNow(new Date(h.createdAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </span>
                      <span className="font-hud text-gold inline-flex items-center gap-1 text-[13px] font-bold">
                        <Coins size={12} strokeWidth={2.6} />+{h.coinsAwarded}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!mine && (
              <p className="text-ar-faint flex items-center justify-center gap-1.5 text-[12px]">
                <Frame size={13} /> Sign in to see your scans of this mural.
              </p>
            )}
          </div>
        )}
      </div>

      {mural && (
        <NameMuralSheet
          muralId={mural.id}
          autoTitle={mural.title}
          open={naming}
          onClose={() => setNaming(false)}
        />
      )}
    </AppShell>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-ar border-ar-line border bg-white/[0.03] px-2 py-2.5">
      <p
        className={cn(
          "font-hud flex items-center justify-center gap-1 text-[16px] font-bold",
          gold ? "text-gold" : "text-ar-text",
        )}
      >
        {gold && <Coins size={13} strokeWidth={2.5} />}
        {value}
      </p>
      <p className="text-ar-faint mt-0.5 text-[9.5px] tracking-[0.12em] uppercase">{label}</p>
    </div>
  );
}
