"use client";

import { format } from "date-fns";
import { Coins, Frame, Gift, ShieldX, Sparkles, Undo2, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { Skeleton } from "~/components/ui/Skeleton";
import { useAuth } from "~/lib/ar/store";
import { cn } from "@wadzzo/ui/lib/cn";
import { api } from "~/utils/api";

/**
 * ── /coins ─────────────────────────────────────────────────────────────────
 *
 * Wadzzo Coins: the balance and every change to it. Read-only — redeeming
 * isn't built yet, and the screen says so instead of showing a dead button.
 */

const REASON: Record<string, { label: string; icon: LucideIcon }> = {
  MURAL_SCAN: { label: "Mural scan", icon: Frame },
  MURAL_DISCOVERY: { label: "Discovery bonus", icon: Sparkles },
  MURAL_REVOKE: { label: "Taken back — rejected as fraud", icon: ShieldX },
  ADMIN_ADJUST: { label: "Adjustment", icon: Undo2 },
};

export default function CoinsScreen() {
  const signedIn = useAuth((s) => Boolean(s.user));
  const requireAuth = useAuth((s) => s.requireAuth);
  const balance = api.coins.balance.useQuery(undefined, { enabled: signedIn });
  const history = api.coins.history.useInfiniteQuery(
    { limit: 30 },
    { enabled: signedIn, getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  // Zero-amount rows only annotate a revoke the balance couldn't cover.
  const rows = (history.data?.pages.flatMap((p) => p.items) ?? []).filter((r) => r.amount !== 0);

  return (
    <AppShell tabs={false}>
      <div className="ar-scroll h-full pb-10">
        <ScreenHeader back eyebrow="Wallet" title="Wadzzo Coins" />

        {!signedIn ? (
          <div className="px-5 pt-8 text-center">
            <Coins size={30} strokeWidth={1.8} className="mx-auto text-gold" />
            <p className="font-hud mt-3 text-[15px] font-bold text-ar-text">Sign in to see your coins</p>
            <ArButton variant="primary" size="md" className="mt-4" onClick={() => requireAuth("murals")}>
              Sign in
            </ArButton>
          </div>
        ) : (
          <div className="space-y-4 px-5">
            <div className="rounded-ar-lg border border-gold/40 bg-gold/10 px-5 py-6 text-center">
              <p className="font-hud flex items-center justify-center gap-2 text-[38px] font-bold leading-none text-gold tabular-nums">
                <Coins size={30} strokeWidth={2.3} />
                {balance.isLoading ? "—" : (balance.data?.balance ?? 0).toLocaleString()}
              </p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-ar-faint">Your balance</p>
            </div>

            <div className="flex items-start gap-3 rounded-ar border border-ar-line px-4 py-3">
              <Gift size={18} strokeWidth={2.2} className="mt-0.5 shrink-0 text-ar-dim" />
              <p className="text-[12px] leading-relaxed text-ar-dim">
                <b className="text-ar-text">Redeem coming soon.</b> Keep collecting — every coin you earn now will count.
              </p>
            </div>

            <div>
              <p className="font-hud mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ar-dim">History</p>
              {history.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <div className="rounded-ar border border-dashed border-ar-line px-6 py-8 text-center">
                  <p className="text-[12.5px] text-ar-dim">No coins yet. Scan a mural to earn your first.</p>
                  <ArLinkButton href="/murals" variant="primary" size="md" className="mt-4">
                    Open the Murals camera
                  </ArLinkButton>
                </div>
              ) : (
                <ul className="divide-y divide-ar-line rounded-ar border border-ar-line">
                  {rows.map((r) => {
                    const meta = REASON[r.reason] ?? REASON.ADMIN_ADJUST!;
                    const Icon = meta.icon;
                    const plus = r.amount > 0;
                    const body = (
                      <>
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                            plus ? "border-gold/40 bg-gold/10 text-gold" : "border-ar-danger/40 bg-ar-danger/10 text-ar-danger",
                          )}
                        >
                          <Icon size={15} strokeWidth={2.3} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] text-ar-text">{r.mural?.title ?? meta.label}</span>
                          <span className="block truncate text-[10.5px] text-ar-faint">
                            {meta.label} · {format(new Date(r.createdAt), "MMM d, p")}
                          </span>
                        </span>
                        <span className={cn("font-hud text-[14px] font-bold tabular-nums", plus ? "text-gold" : "text-ar-danger")}>
                          {plus ? "+" : "−"}
                          {Math.abs(r.amount).toLocaleString()}
                        </span>
                      </>
                    );
                    return (
                      <li key={r.id}>
                        {r.mural ? (
                          <Link href={`/murals/${r.mural.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.03]">
                            {body}
                          </Link>
                        ) : (
                          <div className="flex items-center gap-3 px-3 py-2.5">{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {history.hasNextPage && (
                <div className="mt-4 flex justify-center">
                  <ArButton variant="outline" size="md" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
                    {history.isFetchingNextPage ? "Loading…" : "Show more"}
                  </ArButton>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
