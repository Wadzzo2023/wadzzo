import { User } from "lucide-react";
import Link from "next/link";

import { useAuth } from "~/lib/ar/store";
import { useBountyAttention } from "~/lib/ar/useBountyAttention";
import { cn } from "~/lib/utils";

/**
 * ── ProfileButton ──────────────────────────────────────────────────────────
 *
 * The way to your profile now that it's no longer a tab — the tab slot went
 * to Bounty. Top-right on every root screen, where apps conventionally keep
 * "you", so it's found without being taught.
 *
 * Signed in it's your avatar; signed out it's a plain person glyph, and
 * /profile itself carries the sign-in pitch. The dot mirrors the Bounty tab's:
 * a win or a brand reply you haven't opened yet.
 */
export function ProfileButton({ className }: { className?: string }) {
  const user = useAuth((s) => s.user);
  const { count } = useBountyAttention();

  return (
    <Link
      href="/profile"
      aria-label={count > 0 ? `Profile, ${count} new` : "Profile"}
      className={cn(
        "ar-glass relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ar-dim",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ar-green",
        className,
      )}
    >
      {user ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatarUrl}
          alt=""
          className="h-[30px] w-[30px] rounded-full object-cover ring-1 ring-ar-green/50"
        />
      ) : (
        <User size={17} strokeWidth={2.2} />
      )}
      {count > 0 && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-ar-bg bg-ar-green-hot shadow-[0_0_8px_hsl(var(--ar-green)/0.9)]"
        />
      )}
    </Link>
  );
}
