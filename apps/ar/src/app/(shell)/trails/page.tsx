"use client";

import { useState } from "react";

import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { TrailCard, TrailCardSkeleton } from "~/components/trails/TrailCard";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { useAuth } from "~/lib/ar/store";
import { useGeolocation } from "~/lib/ar/useGeolocation";
import { api } from "~/utils/api";

type Tab = "near" | "mine";

/**
 * ── /trails ────────────────────────────────────────────────────────────────
 *
 * Brands' map trails (docs/trails): a route of their pins you follow stop by stop, with a
 * reward for finishing. Near you first; "Mine" is the ones you started.
 */
export default function TrailsScreen() {
  const [tab, setTab] = useState<Tab>("near");
  const signedIn = useAuth((s) => Boolean(s.user));
  const requireAuth = useAuth((s) => s.requireAuth);
  const { fix } = useGeolocation();

  const near = api.trails.nearby.useQuery(
    { lat: fix?.lat, lng: fix?.lng, radiusKm: 50 },
    { enabled: tab === "near", staleTime: 60_000 },
  );
  const mine = api.trails.mine.useQuery(undefined, { enabled: tab === "mine" && signedIn });
  const active = tab === "near" ? near : mine;
  const items = active.data ?? [];

  return (
    <AppShell tabs={false}>
      <div className="flex h-full flex-col">
        <ScreenHeader back eyebrow="From brands" title="Trails" />
        <div className="ar-scroll flex-1 pb-6">
          <SegmentedTabs
            layoutId="trails-segments"
            value={tab}
            onChange={(t) => {
              if (t === "mine" && !requireAuth("collect")) return;
              setTab(t);
            }}
            className="mx-5"
            tabs={[
              { id: "near", label: "Near you" },
              { id: "mine", label: "Mine" },
            ]}
          />
          <div className="mt-3.5 space-y-3 px-5">
            {active.isLoading &&
              Array.from({ length: 3 }).map((_, i) => <TrailCardSkeleton key={i} />)}
            {items.map((t) => (
              <TrailCard key={t.id} trail={t} fix={fix} />
            ))}
            {active.isError && (
              <div className="rounded-ar border-ar-danger/40 bg-ar-danger/10 flex items-center justify-between gap-3 border px-3.5 py-2.5">
                <p className="text-ar-danger text-[12px]">Couldn&rsquo;t load trails.</p>
                <button
                  onClick={() => void active.refetch()}
                  className="font-hud text-ar-text text-[11px] font-semibold tracking-[0.1em] uppercase"
                >
                  Retry
                </button>
              </div>
            )}
            {!active.isLoading && !active.isError && items.length === 0 && (
              <div className="py-14 text-center">
                <p className="font-hud text-ar-dim text-[13px] font-bold tracking-[0.14em] uppercase">
                  {tab === "near" ? "No trails nearby" : "No trails yet"}
                </p>
                <p className="text-ar-faint mx-auto mt-1.5 max-w-[17rem] text-[12.5px] leading-relaxed">
                  {tab === "near"
                    ? "When brands near you publish a trail, it shows up here."
                    : "Start a trail and it stays here until you finish."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
