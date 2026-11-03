import { Coins, User } from "lucide-react";
import Link from "next/link";

import { useAuth } from "~/lib/ar/store";
import { useBountyAttention } from "~/lib/ar/useBountyAttention";
import { cn } from "@wadzzo/ui/lib/cn";
import { api } from "~/utils/api";

/**
 * ── ProfileButton ──────────────────────────────────────────────────────────
 *
 * The way to your profile now that it's no longer a tab — the tab slot went
 * to Bounty. Top-right on every root screen, where apps conventionally keep
 * "you", so it's found without being taught.
 *
 * Signed in it's your avatar; signed out it's a plain person glyph, and
 * /profile itself carries the sign-in pitch. The dot: a bounty win or a
 * brand reply you haven't opened yet.
 *
 * `balance` (the map) widens it into one capsule: your platform-token balance,
 * then the avatar, all of it opening the profile.
 */
export function ProfileButton({
  className,
  balance = false,
}: {
  className?: string;
  balance?: boolean;
}) {
  const user = useAuth((s) => s.user);
  const { count } = useBountyAttention();
  const withBalance = balance && Boolean(user);
  const platformBalance = api.user.platformBalance.useQuery(undefined, {
    enabled: withBalance,
    staleTime: 30_000,
  });
  const data = withBalance ? platformBalance.data : undefined;

  return (
    <Link
      href="/profile"
      aria-label={[
        "Profile",
        data && `${data.balance.toLocaleString("en-US")} ${data.assetCode}`,
        count > 0 && `${count} new`,
      ]
        .filter(Boolean)
        .join(", ")}
      className={cn(
        "ar-glass text-ar-dim relative flex h-9 shrink-0 items-center justify-center rounded-full",
        withBalance ? "gap-1.5 pr-[3px] pl-2.5" : "w-9",
        "focus-visible:ring-ar-green focus-visible:ring-2 focus-visible:outline-hidden",
        className,
      )}
    >
      {withBalance && (
        <span className="flex items-center gap-1">
          <Coins size={13} strokeWidth={2.4} className="text-ar-green-hot shrink-0" />
          {platformBalance.isPending ? (
            <span className="bg-ar-line h-3 w-9 animate-pulse rounded-full" />
          ) : !data ? (
            <span className="font-hud text-ar-faint text-[11px] font-bold">—</span>
          ) : (
            <>
              <span className="font-hud text-ar-text text-[13px] leading-none font-bold tabular-nums">
                {data.balance.toLocaleString("en-US", {
                  notation: data.balance >= 100_000 ? "compact" : "standard",
                  maximumFractionDigits: data.balance >= 100_000 ? 1 : 2,
                })}
              </span>
              <span className="font-hud text-ar-dim text-[8.5px] font-semibold tracking-[0.12em] uppercase">
                {data.assetCode}
              </span>
            </>
          )}
        </span>
      )}
      {user ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatarUrl}
          alt=""
          className="ring-ar-green/50 h-[30px] w-[30px] rounded-full object-cover ring-1"
        />
      ) : (
        <User size={17} strokeWidth={2.2} />
      )}
      {count > 0 && (
        <span
          aria-hidden
          className="border-ar-bg bg-ar-green-hot absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 shadow-[0_0_8px_hsl(var(--ar-green)/0.9)]"
        />
      )}
    </Link>
  );
}
