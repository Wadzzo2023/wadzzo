import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import { clientsign } from "package/connect_wallet/src/lib/stellar/utils";

import { api } from "~/utils/api";
import { clientSelect } from "~/lib/stellar/client-select";
import { distanceMeters } from "./geo";
import { pinStatus } from "./rarity";
import { useSettings } from "./store";
import type { ArBrand, ArPin, GeoFix } from "./types";

/**
 * ── Pin state ──────────────────────────────────────────────────────────────
 *
 * Pins come from `api.pins.list`, which resolves privacy, tier eligibility and
 * multiPin collection semantics server-side. Every approved drop is returned
 * to every viewer; the ones they can't take arrive `locked` with a reason.
 *
 * Claims go through `api.pins.collect`, which writes a real `LocationConsumer`
 * row and hands back the redeem code. The mutation patches the `pins.list`
 * cache directly on success rather than refetching, so a capture shows up
 * instantly on the map, the AR view and the collection screen at once.
 */

/** Brands, with real follow state for the signed-in viewer. */
export function useBrandsQuery() {
  const query = api.brands.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  return { ...query, brands: query.data ?? EMPTY_BRANDS };
}

export function useBrands(): ArBrand[] {
  return useBrandsQuery().brands;
}

/**
 * Follow / unfollow.
 *
 * Following is a three-act flow, not one call, because in Wadzzo a follow *is*
 * a trustline to the brand's page asset:
 *
 *   1. `followXdr`  — server builds the changeTrust transaction (mother pays
 *                     the 0.5 XLM reserve the trustline costs), or says the
 *                     wallet already trusts the asset.
 *   2. `clientsign` — the user signs and submits it. Custodial wallets were
 *                     already co-signed server-side; self-custody wallets
 *                     prompt here.
 *   3. `follow`     — only now is the `Follow` row written.
 *
 * Both caches are invalidated at the end, not just the brands list: following
 * unlocks that creator's PRIVATE drops, so every `locked` flag in the pin list
 * is stale the moment this lands. Refetching pins is what makes a locked pin
 * visibly turn collectible.
 */
export type FollowPhase =
  | "preparing"
  | "signing"
  | "confirming"
  | "unfollowing";

/**
 * What the button says at each stage. These are not decoration — following
 * takes several seconds and passes through genuinely different states, and one
 * of them ("Approve in wallet") is a *request*: a self-custody wallet is
 * waiting on the user, and a button that just sat there spinning would leave
 * them staring at the wrong window.
 */
export const FOLLOW_PHASE_LABEL: Record<FollowPhase, string> = {
  preparing: "Preparing",
  signing: "Approve in wallet",
  confirming: "Confirming",
  unfollowing: "Unfollowing",
};

export function useToggleFollow() {
  const utils = api.useUtils();
  const { data: session } = useSession();
  const [pending, setPending] = useState<{
    id: string;
    phase: FollowPhase;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settle = async () => {
    await Promise.all([
      utils.brands.list.invalidate(),
      utils.pins.list.invalidate(),
    ]);
  };

  const followXdr = api.brands.followXdr.useMutation();
  const follow = api.brands.follow.useMutation();
  const unfollow = api.brands.unfollow.useMutation();

  const doFollow = async (brandId: string) => {
    setError(null);
    setPending({ id: brandId, phase: "preparing" });
    try {
      const step = await followXdr.mutateAsync({ brandId });

      // Nothing to sign when the trustline already exists — going straight to
      // the row is what the reference does, and re-trusting would only burn a
      // fee to change nothing.
      if (!step.alreadyTrusted) {
        setPending({ id: brandId, phase: "signing" });
        const signed = await clientsign({
          presignedxdr: step.xdr,
          pubkey: session?.user?.id,
          walletType: session?.user?.walletType,
          test: clientSelect(),
        });
        if (!signed) {
          setError("Transaction failed while signing.");
          return;
        }
      }

      setPending({ id: brandId, phase: "confirming" });
      await follow.mutateAsync({ brandId });
      await settle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not follow this brand.");
    } finally {
      setPending(null);
    }
  };

  const doUnfollow = async (brandId: string) => {
    setError(null);
    setPending({ id: brandId, phase: "unfollowing" });
    try {
      await unfollow.mutateAsync({ brandId });
      await settle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unfollow.");
    } finally {
      setPending(null);
    }
  };

  return {
    error,
    /** Only the brand actually being worked on — not the whole list. */
    pendingId: pending?.id ?? null,
    phase: pending?.phase ?? null,
    /** The button's label for one brand, whatever state it's in. */
    labelFor: (brand: Pick<ArBrand, "id" | "followed">) =>
      pending?.id === brand.id
        ? FOLLOW_PHASE_LABEL[pending.phase]
        : brand.followed
          ? "Following"
          : "Follow",
    toggle: (brand: Pick<ArBrand, "id" | "followed">) => {
      if (pending) return;
      void (brand.followed ? doUnfollow(brand.id) : doFollow(brand.id));
    },
  };
}

const EMPTY_BRANDS: ArBrand[] = [];

/**
 * Claim a pin for real.
 *
 * The server decides everything that matters — range, eligibility, whether the
 * drop still has stock — so this deliberately doesn't pre-judge any of it
 * beyond passing the current fix. Failures come back as readable messages
 * ("You're 210 m away…", "Follow this brand to unlock") meant to be shown
 * verbatim.
 */
export function useCollectPin() {
  const utils = api.useUtils();

  return api.pins.collect.useMutation({
    onSuccess: (result, variables) => {
      // Patch in place instead of invalidating: a refetch would drop the whole
      // list mid-celebration, and the server already told us exactly what
      // changed. `multiPin: false` groups collect every sibling at once, but
      // the list query can't know the grouping from here — the next natural
      // refetch reconciles those; this keeps the captured pin correct now.
      utils.pins.list.setData(undefined, (prev) =>
        prev?.map((pin) =>
          pin.id === variables.locationId
            ? {
                ...pin,
                collected: true,
                collectedAt: result.collectedAt,
                redeemCode: result.redeemCode,
                isRedeemed: false,
                remaining: result.remaining,
                locked: false,
                lockReason: null,
              }
            : pin,
        ),
      );
    },
  });
}

/**
 * The live pin query, for screens that need to tell "still loading" apart from
 * "genuinely nothing here" — an empty map is a real state now, not just a
 * fixture that failed to render.
 */
export function usePinsQuery() {
  const query = api.pins.list.useQuery(undefined, {
    // Collecting is the only thing that changes a pin, and the mutation
    // patches the cache itself — so don't re-fetch the whole drop set on
    // every window focus.
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  return { ...query, pins: query.data ?? EMPTY_PINS };
}

/** Stable identity so `pins` isn't a fresh [] on every render while loading. */
const EMPTY_PINS: ArPin[] = [];

export function usePins(): ArPin[] {
  return usePinsQuery().pins;
}

/**
 * One brand's drops, paginated on the server.
 *
 * Deliberately not a client-side filter over `usePins()`. A brand page asks a
 * narrow question — "what does *this* brand have out" — and answering it from
 * the global pin list means downloading every drop on the map to throw nearly
 * all of them away. The Wadzzo brand account alone has 102 live drops; a page
 * that mounts all of them is what exhausted iOS Safari's GPU budget and killed
 * the tab.
 *
 * Pages accumulate rather than replace: "Show more" should extend the grid, not
 * swap it, so `keepPreviousData` holds the current page on screen while the
 * next one is in flight instead of flashing the empty state.
 */
export function useBrandPinsQuery(args: {
  brandId: string | null;
  tab: "live" | "yours";
  pageSize?: number;
}) {
  const query = api.pins.byBrand.useInfiniteQuery(
    {
      brandId: args.brandId ?? "",
      tab: args.tab,
      limit: args.pageSize ?? 24,
    },
    {
      enabled: Boolean(args.brandId),
      getNextPageParam: (last) => last.nextCursor,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  );

  const pins = useMemo(
    () => query.data?.pages.flatMap((p) => p.pins) ?? EMPTY_PINS,
    [query.data],
  );

  return {
    ...query,
    pins,
    // Every page carries the same total, so the newest one is as good as any —
    // and it's the freshest read of a number that can move while you page.
    total: query.data?.pages.at(-1)?.total ?? 0,
  };
}

/**
 * Pins for the two *discovery* surfaces — the map and the AR scene — with the
 * "Following only" preference applied.
 *
 * Deliberately a separate hook rather than a filter inside `usePinsQuery`,
 * because that setting is about what you're being *shown while looking for
 * something new*, not about what exists. Folding it into the base query would
 * quietly break four other screens that legitimately need the unfiltered set:
 *
 *   - the binder (`/collection`) and the profile's stats — cards you already
 *     own are yours whether or not you still follow the brand, and having them
 *     vanish from your own collection would read as data loss;
 *   - a single card's detail page, reachable directly by URL;
 *   - `/directions/[id]`, where the whole page is about one specific pin —
 *     filtering it out would blank the screen you just navigated to;
 *   - `/brands/[id]`, where you're explicitly looking at one brand's drops, so
 *     hiding them for not following that brand is self-contradictory.
 *
 * Map and AR share this hook so they can't disagree about which drops are
 * real; an AR pin with no matching map pin would read as a bug, not a filter.
 *
 * Falls open while brands are still loading — an empty `brands` array would
 * otherwise mean "follow nothing", blanking the map on every cold load.
 */
/**
 * Exactly what the discovery screens consume — no more.
 *
 * Declared explicitly rather than inferred from a `{ ...query }` spread. A
 * tRPC query result carries a very large generic type, and re-exporting it
 * through a wrapper compounds it: TypeScript can hit its instantiation limit
 * while expanding it and silently fall back to `any`, at which point every
 * type-aware lint rule downstream starts reporting "unsafe assignment" on
 * values that are in fact well typed. Naming the three fields the callers
 * actually use keeps the type small, keeps those callers honest about their
 * surface, and removes the failure mode entirely.
 */
export interface DiscoveryPinsResult {
  pins: ArPin[];
  isLoading: boolean;
  isError: boolean;
  /** Re-run the underlying query. Callers only ever fire-and-forget it. */
  refetch: () => Promise<unknown>;
}

export function useDiscoveryPinsQuery(): DiscoveryPinsResult {
  const { pins, isLoading, isError, refetch } = usePinsQuery();
  const followingOnly = useSettings((s) => s.followingOnly);
  const { brands, isLoading: brandsLoading } = useBrandsQuery();

  const discovered = useMemo(() => {
    if (!followingOnly || brandsLoading) return pins;
    const followed = new Set(brands.filter((b) => b.followed).map((b) => b.id));
    return pins.filter((p) => followed.has(p.brandId));
  }, [pins, followingOnly, brands, brandsLoading]);

  return { pins: discovered, isLoading, isError, refetch };
}

export function useDiscoveryPins(): ArPin[] {
  return useDiscoveryPinsQuery().pins;
}

export type PinFilterId = "all" | "following" | "available" | "collected";

export const PIN_FILTERS: { id: PinFilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "following", label: "Following" },
  { id: "available", label: "Available" },
  { id: "collected", label: "Collected" },
];

export function filterPins(
  pins: ArPin[],
  filter: PinFilterId,
  followedBrandIds: Set<string>,
): ArPin[] {
  switch (filter) {
    case "following":
      return pins.filter((p) => followedBrandIds.has(p.brandId));
    case "available":
      return pins.filter((p) => pinStatus(p) === "collectible");
    case "collected":
      return pins.filter((p) => p.collected);
    default:
      return pins;
  }
}

/** Pins sorted by distance from the current fix, nearest first. */
export function sortByDistance(pins: ArPin[], fix: GeoFix | null) {
  if (!fix) return pins.map((pin) => ({ pin, distance: Number.POSITIVE_INFINITY }));
  return pins
    .map((pin) => ({ pin, distance: distanceMeters(fix, pin) }))
    .sort((a, b) => a.distance - b.distance);
}
