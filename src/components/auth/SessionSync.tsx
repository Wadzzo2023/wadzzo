import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

import { deriveArUser, useAuth } from "~/lib/ar/store";
import { api } from "~/utils/api";

/**
 * ── SessionSync ────────────────────────────────────────────────────────────
 *
 * The one place `useSession()` gets called. Every screen reads auth state
 * through `useAuth((s) => s.user)` — a plain zustand selector — rather than
 * calling `useSession()` itself, so a session poll re-renders this one
 * invisible component instead of every screen that happens to check whether
 * someone's signed in.
 *
 * Mounted once in `_app.tsx`, outside the route tree, so it keeps running
 * (and the session stays current) across every tab switch.
 *
 * Ignores the `loading` status rather than clearing the user during it.
 * `useAuth`'s `user` is itself persisted to localStorage, so on a fresh page
 * load there's already a cached identity on screen the instant React
 * hydrates — reacting to `loading` would blank that out for the second or so
 * NextAuth's client takes to confirm the cookie, then flash it back in.
 * `unauthenticated` is acted on immediately: a persisted user with no valid
 * cookie behind it is stale, not correct, the moment that's known.
 *
 * ## Why this also clears the query cache
 *
 * `useAuth`'s `user` isn't the only thing that depends on who's signed in —
 * most of the app's data does too, server-side. `pins.list` and
 * `brands.followed` (among others) branch on `ctx.session?.user.id` to decide
 * what's locked, what's already collected, what's followed. react-query
 * caches a response keyed by input, not by identity, so it has no way to know
 * a cached `pins.list` result was computed for "nobody" the moment it starts
 * being asked on behalf of someone. Signing in used to leave every screen
 * showing exactly that stale, signed-out data until a hard reload threw the
 * whole cache away — which reads as "the login didn't really take," even
 * though the session itself updated correctly the whole time.
 *
 * `void utils.invalidate()` refetches everything currently mounted against
 * the newly-current identity. Keyed on the user's *id* rather than the
 * session object — a new object reference arrives on every background
 * session poll — so this fires once on an actual sign-in or sign-out, not on
 * every revalidation. The `undefined` guard on the first run skips
 * invalidating on mount, when there's nothing stale yet to clear.
 */
export function SessionSync() {
  const { data: session, status } = useSession();
  const setUser = useAuth((s) => s.setUser);
  const utils = api.useUtils();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (status === "loading") return;

    const userId =
      status === "authenticated" && session?.user ? session.user.id : null;

    setUser(
      status === "authenticated" && session?.user
        ? deriveArUser(session.user)
        : null,
    );

    if (previousUserId.current !== undefined && previousUserId.current !== userId) {
      void utils.invalidate();
    }
    previousUserId.current = userId;
  }, [status, session, setUser, utils]);

  return null;
}
