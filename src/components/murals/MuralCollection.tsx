import { ChevronRight, Coins, Frame, ScanLine, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";

import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { CardSkeleton } from "~/components/ui/Skeleton";
import { useAuth } from "~/lib/ar/store";
import { cn } from "~/lib/utils";
import { api } from "~/utils/api";

/**
 * ── Collection › Murals ────────────────────────────────────────────────────
 *
 * Every mural the viewer has scanned, as their own photo of it (never
 * anyone else's — plan §12.6), with the Wadzzo Coins balance on top. A
 * mural rejected as "not a mural" stays, greyed; one rejected as fraud is
 * gone (the server already drops it).
 */
export function MuralCollection({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const requireAuth = useAuth((s) => s.requireAuth);
  const balance = api.coins.balance.useQuery(undefined, { enabled: signedIn, staleTime: 30_000 });
  const mine = api.murals.mine.useInfiniteQuery(
    { limit: 24 },
    { enabled: signedIn, getNextPageParam: (last) => last.nextCursor ?? undefined, staleTime: 30_000 },
  );
  const items = mine.data?.pages.flatMap((p) => p.items) ?? [];
  const total = mine.data?.pages[0]?.total ?? 0;

  if (!signedIn) {
    return (
      <div className="mx-5 mt-6 text-center">
        <Frame size={30} strokeWidth={1.7} className="mx-auto text-rarity-epic" />
        <p className="font-hud mt-3 text-[15px] font-bold text-ar-text">Murals you find live here</p>
        <p className="mx-auto mt-1.5 max-w-[17rem] text-[12px] leading-relaxed text-ar-dim">
          Scan street art with the camera to collect it and earn Wadzzo Coins.
        </p>
        <ArButton variant="primary" size="md" className="mt-4" onClick={() => requireAuth("murals")}>
          Sign in
        </ArButton>
      </div>
    );
  }

  return (
    <div className="ar-scroll flex-1 px-5 pb-6">
      {/* ── Coins ──────────────────────────────────────────────────── */}
      <Link
        href="/coins"
        className="flex items-center gap-3 rounded-ar border border-gold/35 bg-gold/10 px-4 py-3 transition-colors hover:bg-gold/15"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/50 bg-gold/15 text-gold">
          <Coins size={19} strokeWidth={2.3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-hud block text-[20px] font-bold leading-none text-gold tabular-nums">
            {balance.isLoading ? "—" : (balance.data?.balance ?? 0).toLocaleString()}
          </span>
          <span className="mt-1 block text-[10.5px] uppercase tracking-[0.12em] text-ar-faint">
            Wadzzo Coins · redeem coming soon
          </span>
        </span>
        <ChevronRight size={17} strokeWidth={2.3} className="text-ar-faint" />
      </Link>

      <div className="mb-2.5 mt-5 flex items-baseline justify-between">
        <p className="font-hud text-[11px] font-bold uppercase tracking-[0.14em] text-ar-dim">
          {total > 0 ? `${total} mural${total === 1 ? "" : "s"}` : "Murals"}
        </p>
        <Link href="/murals" className="font-hud flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.12em] text-rarity-epic">
          <ScanLine size={12} strokeWidth={2.6} /> Scan
        </Link>
      </div>

      {mine.isLoading ? (
        <div className="grid grid-cols-2 gap-3.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-ar border border-dashed border-ar-line px-6 py-8 text-center">
          <Frame size={28} strokeWidth={1.7} className="mx-auto text-rarity-epic" />
          <p className="font-hud mt-3 text-[14px] font-bold text-ar-text">No murals yet</p>
          <p className="mx-auto mt-1.5 max-w-[16rem] text-[12px] leading-relaxed text-ar-dim">
            Point the camera at a mural or graffiti and turn a little left and right. The first finders get a bonus.
          </p>
          <ArLinkButton href="/murals" variant="primary" size="md" icon={ScanLine} className="mt-4">
            Open the Murals camera
          </ArLinkButton>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3.5">
            {items.map((m) => {
              const dead = m.status === "REJECTED";
              return (
                <button
                  key={m.id}
                  onClick={() => void router.push(`/murals/${m.id}`)}
                  className={cn("group text-left", dead && "opacity-55 grayscale")}
                >
                  <span className="relative block aspect-[4/5] overflow-hidden rounded-[14px] border-2 border-rarity-epic/70 bg-ar-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the viewer's own S3 photo */}
                    <img src={m.myPhotoUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                    {m.rank != null && (
                      <span className="font-hud absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-ar-void/80 px-1.5 py-[2px] text-[9px] font-bold uppercase tracking-[0.12em] text-rarity-epic">
                        <Sparkles size={9} strokeWidth={2.8} />
                        {m.rank === 1 ? "Discoverer" : `Finder #${m.rank}`}
                      </span>
                    )}
                    <span className="font-hud absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-ar-void/80 px-1.5 py-[2px] text-[10px] font-bold text-gold">
                      <Coins size={10} strokeWidth={2.6} />
                      {m.coinsEarned}
                    </span>
                  </span>
                  <span className="mt-1.5 block truncate text-[12.5px] font-semibold text-ar-text">{m.title}</span>
                  <span className="block truncate text-[10.5px] text-ar-faint">
                    {dead ? "Not collectable" : m.status === "APPROVED" ? "Verified" : "Unverified"} · {m.myScans} scan
                    {m.myScans === 1 ? "" : "s"}
                  </span>
                </button>
              );
            })}
          </div>
          {mine.hasNextPage && (
            <div className="mt-5 flex justify-center">
              <ArButton variant="outline" size="md" disabled={mine.isFetchingNextPage} onClick={() => void mine.fetchNextPage()}>
                {mine.isFetchingNextPage ? "Loading…" : "Show more"}
              </ArButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
