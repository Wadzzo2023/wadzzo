"use client";

import { Wallet } from "lucide-react";
import Link from "next/link";

import { PLATFORM_ASSET } from "@wadzzo/wallet/config";
import { useUserStellarAcc } from "~/lib/state/wallete/stellar-balances";
import { cn } from "@wadzzo/ui/lib/cn";

const fmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** The signed-in wallet's platform-asset balance (filled by usePortalAccess). */
export function WalletBalance({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const active = useUserStellarAcc((s) => s.active);
  const balance = useUserStellarAcc((s) => s.platformAssetBalance);
  if (!active) return null;
  return (
    <Link
      href="/wallet"
      className={cn(
        "bg-surface-2 hover:border-line-bright hover:bg-accent/50 flex h-10 items-center gap-2.5 rounded-lg border px-2.5 transition-colors",
        collapsed && "justify-center px-0",
        className,
      )}
      title={`${fmt.format(balance)} ${PLATFORM_ASSET.code} · open wallet`}
      aria-label="Open wallet"
    >
      <Wallet className="text-primary size-4 shrink-0" />
      {!collapsed && (
        <span className="font-hud min-w-0 truncate text-sm font-semibold tabular-nums">
          {fmt.format(balance)}{" "}
          <span className="text-muted-foreground text-xs font-medium">{PLATFORM_ASSET.code}</span>
        </span>
      )}
    </Link>
  );
}
