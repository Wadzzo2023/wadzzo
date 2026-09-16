import { ItemPrivacy, Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { AR_CAPTURE_RADIUS, distanceMeters } from "~/lib/ar/geo";
import { deriveRarity, pinStatus } from "~/lib/ar/rarity";
import type { ArPin } from "~/lib/ar/types";
import { StellarAccount } from "~/lib/stellar/account";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";

/**
 * ── Pins ───────────────────────────────────────────────────────────────────
 *
 * Replaces the Milestone-1 fixtures with the real drop system, ported from the
 * main webapp's `api/game/locations` REST endpoints rather than from its
 * `maps.pin` tRPC router — that router is creator/admin tooling, and its one
 * consumer-facing claim mutation (`claimAPin`) is dead code: it stamps
 * `claimedAt` on a `LocationConsumer` that nothing ever creates in that
 * pending state.
 *
 * Vocabulary, because the model names don't say it out loud:
 *
 *   LocationGroup      one drop a brand created — the campaign
 *   Location           one physical point scattered inside that drop's radius
 *   LocationConsumer   one user's claim on one Location
 *
 * A group always scatters `pinNumber` Locations regardless of `multiPin`.
 * What `multiPin` decides is *collection semantics*: when true each Location
 * is separately collectible, when false every Location in the group is the
 * same single collectible and claiming any one of them collects all of them
 * for that user.
 */

/** Fallbacks, matching the main webapp so a brand's art is identical in both. */
const WADZZO_ICON = "https://app.wadzzo.com/images/loading.png";

/**
 * `LocationGroup.limit` is an inventory ceiling, not a scarcity choice — the
 * creator form caps it at the brand's own token balance, and brands that don't
 * want a cap type a sentinel instead of leaving it at the 0 default. 199 of
 * 203 live drops use exactly 999999. Anything at or above this reads as
 * "uncapped" and suppresses every "x of y" denominator in the UI.
 */
const UNCAPPED_LIMIT = 999_999;

const supplyOf = (limit: number): number | null =>
  limit <= 0 || limit >= UNCAPPED_LIMIT ? null : limit;

/**
 * Slack on the server-side geofence, in metres. A phone reporting a 30 m
 * accuracy radius while standing exactly on the boundary is a real thing, and
 * refusing that claim would be indistinguishable from a bug to the person
 * holding it. Generous enough to never punish honest GPS, far too tight to
 * make claiming from elsewhere in the city viable.
 */
const GEOFENCE_SLACK_M = 40;

/** 32 unambiguous characters — no O/0 or I/1, since these get read aloud. */
const REDEEM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRedeemCode(): string {
  return Array.from(
    { length: 6 },
    () => REDEEM_ALPHABET[Math.floor(Math.random() * REDEEM_ALPHABET.length)],
  ).join("");
}

/** One query shape, so `list` and `getById` can't drift apart on includes. */
const groupInclude = {
  Subscription: { select: { id: true, price: true } },
  creator: {
    select: {
      id: true,
      name: true,
      profileUrl: true,
      pageAsset: { select: { code: true, issuer: true } },
      subscriptions: { select: { price: true } },
    },
  },
} as const;

const consumerSelect = {
  userId: true,
  redeemCode: true,
  isRedeemed: true,
  claimedAt: true,
  createdAt: true,
} as const;

type GroupWithCreator = {
  privacy: ItemPrivacy;
  creatorId: string;
  Subscription: { id: number; price: number } | null;
  creator: {
    pageAsset: { code: string; issuer: string } | null;
    subscriptions: { price: number }[];
  };
};

/**
 * Can this viewer *claim* this drop? Follows the main webapp's rules:
 *
 *   PUBLIC   anyone, signed in or not
 *   PRIVATE  followers of the creator
 *   TIER     holders of at least `Subscription.price` of the creator's own
 *            page asset, read live off Horizon
 *
 * Returns the reason it's barred rather than a bare false, because that reason
 * is shown on the card — a locked pin the viewer can't act on is a dead end,
 * whereas "Follow Lumen Coffee to unlock" is the next step.
 *
 * Note this decides *claimability only*. Every approved drop is returned to
 * every viewer; see the note on `list`.
 *
 * The live balance read is why this takes a preloaded account rather than a
 * pubkey — one Horizon round trip serves a whole page of pins.
 */
function lockReasonFor(
  group: GroupWithCreator,
  followedCreatorIds: Set<string>,
  account: StellarAccount | null,
  signedIn: boolean,
): string | null {
  switch (group.privacy) {
    case ItemPrivacy.PUBLIC:
      return null;

    case ItemPrivacy.PRIVATE: {
      if (!signedIn) return "Sign in and follow this brand to unlock";
      return followedCreatorIds.has(group.creatorId)
        ? null
        : "Follow this brand to unlock";
    }

    case ItemPrivacy.TIER: {
      const asset = group.creator.pageAsset;
      const subscription = group.Subscription;
      // A tier drop whose creator never finished setting up an asset or tier
      // can't be cleared by anyone — say so plainly instead of implying the
      // viewer could fix it.
      if (!asset || !subscription) return "Not available";
      const needed = `${subscription.price} ${asset.code}`;
      if (!signedIn || !account) return `Sign in holding ${needed} to unlock`;
      return account.getTokenBalance(asset.code, asset.issuer) >=
        subscription.price
        ? null
        : `Hold ${needed} to unlock`;
    }

    default:
      // DRAFT / FOR_SALE / NOT_FOR_SALE are marketplace privacies the pin
      // form never sets. Never collectible from this app.
      return "Not available";
  }
}

const rarityOfGroup = (group: GroupWithCreator) =>
  deriveRarity({
    privacy: group.privacy,
    subscriptionPrice: group.Subscription?.price ?? null,
    creatorTierPrices: group.creator.subscriptions.map((s) => s.price),
  });

/** One include shape, so `list` and `byBrand` return identically-shaped pins. */
const groupWithLocationsInclude = {
  ...groupInclude,
  locationGroupTags: { select: { tag: { select: { label: true } } } },
  locations: {
    where: { hidden: false },
    include: { consumers: { select: consumerSelect } },
  },
} as const;

type GroupWithLocations = Prisma.LocationGroupGetPayload<{
  include: typeof groupWithLocationsInclude;
}>;

/**
 * The base "this drop is live" filter, as a function rather than a const
 * because `endDate: { gte: new Date() }` has to be evaluated per request — a
 * module-level object would freeze "now" at process start and slowly begin
 * serving drops that have already ended.
 */
const liveGroupWhere = () =>
  ({
    // Everyone sees every gated drop — an anonymous viewer gets the same
    // map, with the gated ones locked.
    privacy: {
      in: [ItemPrivacy.PUBLIC, ItemPrivacy.PRIVATE, ItemPrivacy.TIER],
    },
    approved: { equals: true },
    endDate: { gte: new Date() },
    remaining: { gt: 0 },
    hidden: false,
  }) satisfies Prisma.LocationGroupWhereInput;

/**
 * Flatten one drop into one `ArPin` per physical Location, which is how the
 * map, the AR scene and the card grids all consume it.
 *
 * `lockReason` is passed in rather than computed here because it is a property
 * of the *group*, not the location — and computing it needs a Horizon balance
 * read, so doing it per-location would multiply one round trip by the number
 * of points scattered inside the drop.
 */
function pinsOfGroup(
  group: GroupWithLocations,
  userId: string | null,
  lockReason: string | null,
): ArPin[] {
  const rarity = rarityOfGroup(group);
  const supply = supplyOf(group.limit);
  // Deduped and sorted so the same drop reads the same way every render — the
  // join can legitimately carry the same label twice via different tag rows.
  const tags = [
    ...new Set(group.locationGroupTags.map((t) => t.tag.label)),
  ].sort();
  const image =
    group.optimizedImage ??
    group.image ??
    group.creator.profileUrl ??
    WADZZO_ICON;

  // For a single-collectible group, one claim anywhere in it collects every
  // point in it for this user.
  const groupClaim = userId
    ? group.locations.flatMap((l) => l.consumers).find((c) => c.userId === userId)
    : undefined;

  return group.locations.map((location): ArPin => {
    const ownClaim = userId
      ? location.consumers.find((c) => c.userId === userId)
      : undefined;
    const claim = group.multiPin ? ownClaim : (ownClaim ?? groupClaim);

    return {
      id: location.id,
      lat: location.latitude,
      lng: location.longitude,
      title: group.title,
      description: group.description ?? "No description provided",
      imageUrl: image,
      link: group.link,

      brandId: group.creatorId,
      brandName: group.creator.name ?? "Unknown brand",
      brandImageUrl: group.creator.profileUrl ?? WADZZO_ICON,

      remaining: group.remaining,
      supply,
      rarity,

      autoCollect: location.autoCollect,
      // No column backs this yet — every drop the reference system can
      // produce is claimed by standing near it.
      detection: "gps",
      endsAt: group.endDate.toISOString(),

      collected: claim != null,
      collectedAt:
        claim?.claimedAt?.toISOString() ??
        claim?.createdAt.toISOString() ??
        null,
      redeemCode: claim?.redeemCode ?? null,
      isRedeemed: claim?.isRedeemed ?? null,
      // A drop already collected is never locked — whatever gate it sat
      // behind was cleared at claim time, and un-owning it later would be a
      // strange thing for a collection to do.
      locked: claim == null && lockReason != null,
      lockReason: claim == null ? lockReason : null,

      tags,
    };
  });
}

export const pinsRouter = createTRPCRouter({
  /**
   * Every drop the viewer may collect, flattened to one entry per physical
   * Location the way the map and AR view consume it.
   *
   * Deliberately diverges from the reference endpoint in one place: that query
   * carries `subscriptionId: { equals: null }` in its base filter, which
   * excludes every TIER drop before the tier-balance branch below it can ever
   * run. Tier drops are invisible in the live app as a result. The filter is
   * dropped here and the gating is done properly.
   *
   * `approved` is NOT relaxed, on purpose. It's a tri-state admin moderation
   * gate — null pending, true approved, false rejected — set only by wadzz0's
   * admin-only `approveLocationGroups`. That's the intended gate doing its
   * job: an empty map means nothing has cleared moderation yet.
   *
   * Second deliberate divergence: the reference drops pins the viewer can't
   * claim out of the response entirely. Here every approved drop is returned
   * to everyone, signed in or not, carrying `locked` and a `lockReason`. A
   * gated drop you can see but not take is the whole incentive to follow a
   * brand or hold its token; one you never knew existed can't be.
   */
  list: publicProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }): Promise<ArPin[]> => {
      const userId = ctx.session?.user.id ?? null;

      const [followedCreatorIds, account] = await Promise.all([
        userId
          ? ctx.db.follow
              .findMany({ where: { userId }, select: { creatorId: true } })
              .then((rows) => new Set(rows.map((r) => r.creatorId)))
          : Promise.resolve(new Set<string>()),
        userId ? StellarAccount.createOrNull(userId) : Promise.resolve(null),
      ]);

      const groups = await ctx.db.locationGroup.findMany({
        where: {
          ...liveGroupWhere(),
          locations: { some: { hidden: false } },
        },
        include: groupWithLocationsInclude,
      });

      return groups.flatMap((group) =>
        pinsOfGroup(
          group,
          userId,
          lockReasonFor(group, followedCreatorIds, account, userId != null),
        ),
      );
    }),

  /**
   * One brand's drops, one page at a time.
   *
   * `list` returns every pin on the map, which the map and AR scene genuinely
   * need. A brand's page does not: the Wadzzo account alone has 102 live
   * drops, and shipping all of them so the client could slice off 24 was what
   * put ~400 blended compositing layers on one page and had iOS Safari kill
   * the tab. Only the requested page crosses the wire now.
   *
   * The slice is applied *after* pins are built rather than as SQL LIMIT, and
   * that is deliberate rather than lazy. Which pins belong on each tab depends
   * on `pinStatus`, which depends on `locked` — and lock state is resolved
   * against the viewer's follow set and a live Horizon token balance, neither
   * of which exists in the database to filter on. Offsetting in SQL would
   * paginate a list that isn't the one being shown, so pages would silently
   * come back short. Scoping the read to a single creator keeps that honest
   * *and* bounded: one brand's groups, not the whole map.
   */
  byBrand: publicProcedure
    .input(
      z.object({
        brandId: z.string().min(1),
        tab: z.enum(["live", "yours"]).default("live"),
        limit: z.number().int().min(1).max(48).default(24),
        /**
         * Offset of the first pin in this page. Named `cursor` because tRPC's
         * `useInfiniteQuery` requires that field name, and an offset is a
         * legitimate cursor here: the underlying order is stable (see the
         * `orderBy` below), so position means the same thing between requests.
         */
        cursor: z.number().int().min(0).nullish(),
      }),
    )
    .query(
      async ({
        ctx,
        input,
      }): Promise<{
        pins: ArPin[];
        total: number;
        nextCursor: number | null;
      }> => {
        const userId = ctx.session?.user.id ?? null;
        const offset = input.cursor ?? 0;

        // "Your cards" is meaningless signed out, and answering it with an
        // unfiltered page would be worse than answering it with nothing.
        if (input.tab === "yours" && !userId) {
          return { pins: [], total: 0, nextCursor: null };
        }

        const [followedCreatorIds, account] = await Promise.all([
          userId
            ? ctx.db.follow
                .findMany({ where: { userId }, select: { creatorId: true } })
                .then((rows) => new Set(rows.map((r) => r.creatorId)))
            : Promise.resolve(new Set<string>()),
          userId ? StellarAccount.createOrNull(userId) : Promise.resolve(null),
        ]);

        const groups = await ctx.db.locationGroup.findMany({
          where: {
            ...liveGroupWhere(),
            creatorId: input.brandId,
            locations: {
              some:
                input.tab === "yours"
                  ? { hidden: false, consumers: { some: { userId: userId! } } }
                  : { hidden: false },
            },
          },
          include: groupWithLocationsInclude,
          // Stable order, or a page boundary would reshuffle between requests
          // and the same pin could arrive twice while another never does.
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        });

        const all = groups.flatMap((group) =>
          pinsOfGroup(
            group,
            userId,
            lockReasonFor(group, followedCreatorIds, account, userId != null),
          ),
        );

        const matching = all.filter((pin) =>
          input.tab === "yours"
            ? pin.collected
            : pinStatus(pin) === "collectible",
        );

        const pins = matching.slice(offset, offset + input.limit);
        const next = offset + pins.length;
        return {
          pins,
          total: matching.length,
          nextCursor: next < matching.length ? next : null,
        };
      },
    ),

  /**
   * Claim one Location for the signed-in user.
   *
   * Ported from the REST `api/game/locations/consume` endpoint — the only
   * place in the reference that ever creates a `LocationConsumer` — with two
   * deliberate hardenings that endpoint lacks:
   *
   *  1. A server-side geofence. `consume.ts` takes only a `location_id` and
   *     never checks where the caller is, so anything that can reach the API
   *     can claim every pin on the map without moving. The client already
   *     hides the button out of range; this makes that mean something.
   *
   *  2. Eligibility re-checked at claim time. A client holding a stale pin
   *     list could otherwise claim a drop whose tier it no longer clears, or
   *     one it never could.
   */
  collect: protectedProcedure
    .input(
      z.object({
        locationId: z.string().min(1),
        /** Where the collector says they are, for the geofence. */
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const location = await ctx.db.location.findUnique({
        where: { id: input.locationId },
        include: { locationGroup: { include: groupInclude } },
      });

      const group = location?.locationGroup;
      if (!location || !group || location.hidden) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pin not found" });
      }

      // Same gate `list` applies, so a pin that was never claimable can't be
      // claimed by calling this directly.
      const now = new Date();
      if (group.hidden || group.approved !== true || group.endDate < now) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This drop isn't available",
        });
      }
      if (group.startDate > now) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This drop hasn't started yet",
        });
      }

      // ── Hardening 2: eligibility, re-checked against live state ───────────
      const [followedCreatorIds, account] = await Promise.all([
        ctx.db.follow
          .findMany({ where: { userId }, select: { creatorId: true } })
          .then((rows) => new Set(rows.map((r) => r.creatorId))),
        StellarAccount.createOrNull(userId),
      ]);

      const lockReason = lockReasonFor(group, followedCreatorIds, account, true);
      if (lockReason) {
        throw new TRPCError({ code: "FORBIDDEN", message: lockReason });
      }

      // ── Hardening 1: geofence ─────────────────────────────────────────────
      const distance = distanceMeters(
        { lat: input.lat, lng: input.lng },
        { lat: location.latitude, lng: location.longitude },
      );
      if (distance > AR_CAPTURE_RADIUS + GEOFENCE_SLACK_M) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `You're ${Math.round(distance)} m away — get within ${AR_CAPTURE_RADIUS} m to capture this.`,
        });
      }

      // ── multiPin semantics, exactly as the reference applies them ─────────
      // true:  each Location is its own collectible, one claim per Location.
      // false: the whole group is one collectible, one claim per group.
      const priorClaim = await ctx.db.locationConsumer.findFirst({
        where: group.multiPin
          ? { userId, locationId: location.id }
          : { userId, location: { locationGroupId: group.id } },
        select: { id: true },
      });
      if (priorClaim) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You've already collected this one",
        });
      }

      // `redeemCode` is unique, so rather than check-then-insert (which races)
      // we let the constraint arbitrate and retry the whole transaction on the
      // rare collision. 32^6 ≈ 1.07bn, so this effectively never loops.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          return await ctx.db.$transaction(async (tx) => {
            // Decrement first, guarded by `remaining > 0` in the WHERE so two
            // simultaneous claims on the last item can't both succeed. A zero
            // count means someone else took it between our read and here.
            const claimed = await tx.locationGroup.updateMany({
              where: { id: group.id, remaining: { gt: 0 } },
              data: { remaining: { decrement: 1 } },
            });
            if (claimed.count === 0) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: "Every one of these has been claimed",
              });
            }

            const consumer = await tx.locationConsumer.create({
              data: {
                userId,
                locationId: location.id,
                claimedAt: new Date(),
                redeemCode: generateRedeemCode(),
              },
              select: { id: true, redeemCode: true, claimedAt: true },
            });

            return {
              id: consumer.id,
              redeemCode: consumer.redeemCode,
              collectedAt: (consumer.claimedAt ?? new Date()).toISOString(),
              remaining: Math.max(0, group.remaining - 1),
            };
          });
        } catch (err) {
          const isCodeCollision =
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002" &&
            String(err.meta?.target ?? "").includes("redeemCode");
          if (isCodeCollision) continue;
          throw err;
        }
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not allocate a redeem code",
      });
    }),
});
