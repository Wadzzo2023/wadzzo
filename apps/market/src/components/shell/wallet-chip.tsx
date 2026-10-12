"use client";

import { Wallet } from "lucide-react";
import Link from "next/link";

import { useRequireAuth } from "~/hooks/use-require-auth";
import { useCurrency } from "~/hooks/use-currency";
import { cn } from "@wadzzo/ui/lib/cn";
import { api } from "~/utils/api";

const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const short = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const usdFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const usdShort = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** The signed-in wallet's platform-token balance, linking to the wallet. `compact` abbreviates (1.2K). */
export function WalletChip({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { signedIn } = useRequireAuth();
  const balances = api.wallet.balances.useQuery(undefined, {
    enabled: signedIn,
    staleTime: 30_000,
  });
  const { currency } = useCurrency();
  if (!signedIn) return null;
  const b = balances.data;
  return (
    <Link
      href="/wallet"
      title={b?.active ? `${full.format(b.platform.balance)} ${b.platform.code}` : "Wallet"}
      className={cn(
        "bg-surface-2 hover:border-line-bright flex h-10 items-center gap-2 rounded-lg border px-2.5 transition-colors",
        className,
      )}
    >
      <Wallet className="text-primary size-4 shrink-0" />
      {!b ? (
        <span className="skeleton h-4 w-12 rounded" />
      ) : b.active && currency === "USD" && b.platform.usd != null ? (
        <span className="font-hud min-w-0 truncate text-sm font-semibold tabular-nums">
          {(compact ? usdShort : usdFull).format(b.platform.usd)}
        </span>
      ) : b.active ? (
        <span className="font-hud min-w-0 truncate text-sm font-semibold tabular-nums">
          {(compact ? short : full).format(b.platform.balance)}
          <span
            className={cn(
              "text-muted-foreground ml-1 text-xs font-medium",
              compact && "hidden lg:inline",
            )}
          >
            {b.platform.code}
          </span>
        </span>
      ) : (
        <span className="text-muted-foreground text-sm">Activate</span>
      )}
    </Link>
  );
}
