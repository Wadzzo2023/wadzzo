import { ItemPrivacy, PinType, Prisma } from "@wadzzo/db";
import type { Db } from "@wadzzo/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { AR_CAPTURE_RADIUS, distanceMeters } from "~/lib/ar/geo";
import { deriveRarity, pinStatus, RARITY_ORDER } from "~/lib/ar/rarity";
import type { ArPin, Rarity } from "~/lib/ar/types";
import { StellarAccount } from "@wadzzo/stellar/account";
import { isInPlatformScope, platformScope, type PlatformContext } from "@wadzzo/platform/scope";
import { notifyBrand } from "@wadzzo/platform/server";
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
export const WADZZO_ICON = "https://app.wadzzo.com/images/loading.png";

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
      return account.tokenBalance(asset.code, asset.issuer) >=
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

/** Optional viewing area for `list`: a centre and a radius. */
const areaInput = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().positive().max(2000).optional(),
  /** Only these pin types (website embeds); omitted or empty = all. */
  types: z.array(z.nativeEnum(PinType)).max(6).optional(),
  /** Only this brand's pins (a website embed set to "only my brand"). */
  brandId: z.string().min(1).optional(),
});

/**
 * A lat/lng box around a circle, for an indexable pre-filter in Prisma.
 * Longitude degrees shrink toward the poles, so the box widens with latitude;
 * at the antimeridian it just clamps (no drops out there worth a split query).
 */
function boundingBox({ lat, lng, radiusKm }: { lat: number; lng: number; radiusKm: number }) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return {
    latitude: { gte: Math.max(lat - dLat, -90), lte: Math.min(lat + dLat, 90) },
    longitude: { gte: Math.max(lng - dLng, -180), lte: Math.min(lng + dLng, 180) },
  };
}

/**
 * The base "this drop is live" filter, as a function rather than a const
 * because `endDate: { gte: new Date() }` has to be evaluated per request — a
 * module-level object would freeze "now" at process start and slowly begin
 * serving drops that have already ended.
 */
const liveGroupWhere = (ctx: PlatformContext) =>
  ({
    // This platform's drops; the root platform (web.wadzzo.com) shows every platform's.
    ...platformScope(ctx),
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
/** Everything an `ArPin` needs from its parent drop, resolved once per group. */
function groupFacts(group: GroupWithLocations) {
  return {
    rarity: rarityOfGroup(group),
    supply: supplyOf(group.limit),
    image:
      group.optimizedImage ??
      group.image ??
      group.creator.profileUrl ??
      WADZZO_ICON,
    // Deduped and sorted so the same drop reads the same way every render —
    // the join can legitimately carry the same label twice via different rows.
    tags: [...new Set(group.locationGroupTags.map((t) => t.tag.label))].sort(),
  };
}

type GroupFacts = ReturnType<typeof groupFacts>;
type Claim = GroupWithLocations["locations"][number]["consumers"][number];

/** One physical point, as the app consumes it. */
function toPin(
  group: GroupWithLocations,
  // Typed by what this actually reads rather than by either query's include
  // shape — `collected` fetches a Location without its `consumers` (it has the
  // claim already) and would not otherwise satisfy the wider type.
  location: {
    id: string;
    latitude: number;
    longitude: number;
    autoCollect: boolean;
  },
  claim: Claim | undefined,
  lockReason: string | null,
  facts: GroupFacts,
): ArPin {
  return {
    id: location.id,
    type: group.type,
    lat: location.latitude,
    lng: location.longitude,
    title: group.title,
    description: group.description ?? "No description provided",
    imageUrl: facts.image,
    link: group.link,

    brandId: group.creatorId,
    brandName: group.creator.name ?? "Unknown brand",
    brandImageUrl: group.creator.profileUrl ?? WADZZO_ICON,

    remaining: group.remaining,
    supply: facts.supply,
    rarity: facts.rarity,

    autoCollect: location.autoCollect,
    // No column backs this yet — every drop the reference system can produce
    // is claimed by standing near it.
    detection: "gps",
    endsAt: group.endDate.toISOString(),

    collected: claim != null,
    collectedAt:
      claim?.claimedAt?.toISOString() ?? claim?.createdAt.toISOString() ?? null,
    redeemCode: claim?.redeemCode ?? null,
    isRedeemed: claim?.isRedeemed ?? null,
    // A drop already collected is never locked — whatever gate it sat behind
    // was cleared at claim time, and un-owning it later would be a strange
    // thing for a collection to do.
    locked: claim == null && lockReason != null,
    lockReason: claim == null ? lockReason : null,

    tags: facts.tags,
  };
}

function pinsOfGroup(
  group: GroupWithLocations,
  userId: string | null,
  lockReason: string | null,
): ArPin[] {
  const facts = groupFacts(group);

  // For a single-collectible group, one claim anywhere in it collects every
  // point in it for this user.
  const groupClaim = userId
    ? group.locations
        .flatMap((l) => l.consumers)
        .find((c) => c.userId === userId)
    : undefined;

  return group.locations.map((location) => {
    const ownClaim = userId
      ? location.consumers.find((c) => c.userId === userId)
      : undefined;
    const claim = group.multiPin ? ownClaim : (ownClaim ?? groupClaim);
    return toPin(group, location, claim, lockReason, facts);
  });
}

/**
 * Everything both claim paths check, minus where the collector is standing.
 *
 * Kept separate from the geofence on purpose: the two entry points differ on
 * *proof of presence* and nothing else. Walking up to a pin proves it with GPS;
 * scanning its QR proves it by possession of a code that only exists in the
 * physical place the creator put it. Eligibility (`lockReason`) is a different
 * question — who may hold this drop — and applies to both.
 */
async function assertClaimable(db: Db, userId: string, locationId: string, ctx: PlatformContext) {
  const location = await db.location.findUnique({
    where: { id: locationId },
    include: { locationGroup: { include: groupInclude } },
  });

  const group = location?.locationGroup;
  // Another platform's drop can't be claimed here (web.wadzzo.com may claim any).
  if (!location || !group || location.hidden || !isInPlatformScope(ctx, group.platformId)) {
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

  // Eligibility, re-checked against live state — a client holding a stale pin
  // list could otherwise claim a drop whose tier it no longer clears.
  const [followedCreatorIds, account] = await Promise.all([
    db.follow
      .findMany({ where: { userId }, select: { creatorId: true } })
      .then((rows) => new Set(rows.map((r) => r.creatorId))),
    StellarAccount.load(userId),
  ]);

  const lockReason = lockReasonFor(group, followedCreatorIds, account, true);
  if (lockReason) {
    throw new TRPCError({ code: "FORBIDDEN", message: lockReason });
  }

  return { location, group };
}

/**
 * The write half of a claim: refuse a duplicate, then take one unit of stock
 * and write the consumer row in a single transaction.
 */
async function writeClaim(
  db: Db,
  userId: string,
  location: { id: string },
  group: { id: string; multiPin: boolean; remaining: number },
  /** the platform (site) the claim was made on */
  platformId: string,
) {
  const claim = await writeClaimRow(db, userId, location, group, platformId);
  // Tell the brand (best effort; never fails the collect).
  const info = await db.locationGroup.findUnique({ where: { id: group.id }, select: { title: true, creatorId: true } }).catch(() => null);
  if (info?.creatorId) {
    await notifyBrand(db, { actorId: userId, type: "PIN_COLLECTED", entityId: 0, creatorId: info.creatorId, meta: { pin: info.title, groupId: group.id } });
  }
  return claim;
}

async function writeClaimRow(
  db: Db,
  userId: string,
  location: { id: string },
  group: { id: string; multiPin: boolean; remaining: number },
  /** the platform (site) the claim was made on */
  platformId: string,
) {
  // ── multiPin semantics, exactly as the reference applies them ─────────
  // true:  each Location is its own collectible, one claim per Location.
  // false: the whole group is one collectible, one claim per group.
  const priorClaim = await db.locationConsumer.findFirst({
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
      return await db.$transaction(async (tx) => {
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
            platformId,
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
        (Array.isArray(err.meta?.target) ? err.meta.target.join(",") : typeof err.meta?.target === "string" ? err.meta.target : "").includes("redeemCode");
      if (isCodeCollision) continue;
      throw err;
    }
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Could not allocate a redeem code",
  });
}

/**
 * Relevance of one drop to a search, highest first. Every term already
 * matched somewhere (the database enforced that); this only decides *how
 * well*: a hit at the start of the title beats one buried in a description.
 */
function searchScore(
  group: { title: string; description: string | null; creator: { name: string | null } },
  tags: string[],
  terms: string[],
  phrase: string,
) {
  const title = group.title.toLowerCase();
  const brand = (group.creator.name ?? "").toLowerCase();
  const desc = (group.description ?? "").toLowerCase();
  const tagText = tags.map((t) => t.toLowerCase());
  const wordStart = (hay: string, t: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").test(hay);

  let score = 0;
  if (title === phrase) score += 40;
  else if (title.startsWith(phrase)) score += 25;
  else if (title.includes(phrase)) score += 15;
  if (brand === phrase) score += 20;

  for (const t of terms) {
    if (title.startsWith(t)) score += 10;
    else if (wordStart(title, t)) score += 8;
    else if (title.includes(t)) score += 5;
    if (brand.startsWith(t)) score += 7;
    else if (brand.includes(t)) score += 4;
    if (tagText.some((x) => x === t)) score += 6;
    else if (tagText.some((x) => x.includes(t))) score += 3;
    if (wordStart(desc, t)) score += 2;
    else if (desc.includes(t)) score += 1;
  }
  return score;
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
    .input(areaInput.optional())
    .query(async ({ ctx, input }): Promise<ArPin[]> => {
      const userId = ctx.session?.user.id ?? null;
      // Optional area (mobile): only pins within `radiusKm` of lat/lng. All
      // three or none — the web (and older app builds) send none and still
      // get every live pin.
      const area = input?.lat != null && input.lng != null && input.radiusKm != null ? { lat: input.lat, lng: input.lng, radiusKm: input.radiusKm } : null;
      const box = area ? boundingBox(area) : null;

      const [followedCreatorIds, account] = await Promise.all([
        userId
          ? ctx.db.follow
              .findMany({ where: { userId }, select: { creatorId: true } })
              .then((rows) => new Set(rows.map((r) => r.creatorId)))
          : Promise.resolve(new Set<string>()),
        userId ? StellarAccount.load(userId) : Promise.resolve(null),
      ]);

      // The box narrows it in the database (both which drops, and which of
      // their locations are loaded — with their consumers); the exact circle
      // is applied after.
      const locationWhere = { hidden: false, ...(box ?? {}) } satisfies Prisma.LocationWhereInput;
      const groups = await ctx.db.locationGroup.findMany({
        where: {
          ...liveGroupWhere(ctx),
          ...(input?.types?.length ? { type: { in: input.types } } : {}),
          ...(input?.brandId ? { creatorId: input.brandId } : {}),
          locations: { some: locationWhere },
        },
        include: box
          ? { ...groupWithLocationsInclude, locations: { ...groupWithLocationsInclude.locations, where: locationWhere } }
          : groupWithLocationsInclude,
      });

      const pins = groups.flatMap((group) =>
        pinsOfGroup(
          group,
          userId,
          lockReasonFor(group, followedCreatorIds, account, userId != null),
        ),
      );
      return area
        ? pins.filter((p) => distanceMeters(area, p) <= area.radiusKm * 1000)
        : pins;
    }),

  /**
   * One pin by its Location id — for a card page or a deep link, without
   * shipping the whole map to find it (the mobile app can't afford `list`
   * just to open one card).
   *
   * Unlike `list`, this does NOT require the drop to still be live: a card you
   * own must keep resolving after its drop expires or sells out, and
   * `pinStatus` already reports those states. It does still require admin
   * approval — an unapproved drop is invisible everywhere.
   */
  /**
   * Search every live drop the viewer can see — not just the ones the map has
   * loaded for the current area — so a drop across town (or across the world)
   * can be found by name.
   *
   * Matches title, brand name, description and tags. Each word typed must
   * match somewhere; results are ranked by relevance (see `searchScore`), not
   * distance. One result per drop: its nearest point to `lat`/`lng` when
   * given, otherwise its first point. Same visibility and lock rules as
   * `list`.
   */
  search: publicProcedure
    .input(
      z.object({
        q: z.string().trim().min(2).max(80),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
        limit: z.number().int().min(1).max(30).default(20),
        /** Only this brand's drops (a website embed set to "only my brand"). */
        brandId: z.string().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }): Promise<ArPin[]> => {
      const userId = ctx.session?.user.id ?? null;
      const phrase = input.q.toLowerCase().replace(/\s+/g, " ");
      const terms = [...new Set(phrase.split(" ").filter((t) => t.length > 0))].slice(0, 6);
      const contains = (t: string) => ({ contains: t, mode: "insensitive" as const });

      const groups = await ctx.db.locationGroup.findMany({
        where: {
          ...liveGroupWhere(ctx),
          ...(input.brandId ? { creatorId: input.brandId } : {}),
          locations: { some: { hidden: false } },
          AND: terms.map((t) => ({
            OR: [
              { title: contains(t) },
              { description: contains(t) },
              { creator: { name: contains(t) } },
              { locationGroupTags: { some: { tag: { label: contains(t) } } } },
            ],
          })),
        },
        include: groupWithLocationsInclude,
        // A generous candidate pool; relevance is decided below.
        orderBy: { createdAt: "desc" },
        take: 150,
      });

      const ranked = groups
        .map((g) => ({ g, score: searchScore(g, groupFacts(g).tags, terms, phrase) }))
        .sort((a, b) => b.score - a.score || a.g.title.localeCompare(b.g.title))
        .slice(0, input.limit);
      if (ranked.length === 0) return [];

      // Only pay the Horizon balance read when a tier drop is actually in view.
      const needsAccount = userId != null && ranked.some(({ g }) => g.privacy === ItemPrivacy.TIER);
      const [followedCreatorIds, account] = await Promise.all([
        userId
          ? ctx.db.follow
              .findMany({ where: { userId }, select: { creatorId: true } })
              .then((rows) => new Set(rows.map((r) => r.creatorId)))
          : Promise.resolve(new Set<string>()),
        needsAccount ? StellarAccount.load(userId) : Promise.resolve(null),
      ]);

      const from = input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : null;
      return ranked.flatMap(({ g }) => {
        const pins = pinsOfGroup(g, userId, lockReasonFor(g, followedCreatorIds, account, userId != null));
        if (pins.length === 0) return [];
        const best = from
          ? pins.reduce((a, b) => (distanceMeters(from, b) < distanceMeters(from, a) ? b : a))
          : pins[0]!;
        return [best];
      });
    }),

  byId: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<ArPin> => {
      const userId = ctx.session?.user.id ?? null;
      const location = await ctx.db.location.findUnique({
        where: { id: input.id },
        select: { locationGroupId: true },
      });
      const group = location?.locationGroupId
        ? await ctx.db.locationGroup.findUnique({
            where: { id: location.locationGroupId },
            include: groupWithLocationsInclude,
          })
        : null;
      if (!group || group.approved !== true || !isInPlatformScope(ctx, group.platformId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Drop not found" });
      }

      const [followedCreatorIds, account] = await Promise.all([
        userId
          ? ctx.db.follow
              .findMany({ where: { userId }, select: { creatorId: true } })
              .then((rows) => new Set(rows.map((r) => r.creatorId)))
          : Promise.resolve(new Set<string>()),
        userId ? StellarAccount.load(userId) : Promise.resolve(null),
      ]);

      const pin = pinsOfGroup(
        group,
        userId,
        lockReasonFor(group, followedCreatorIds, account, userId != null),
      ).find((p) => p.id === input.id);
      if (!pin) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Drop not found" });
      }
      return pin;
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
          userId ? StellarAccount.load(userId) : Promise.resolve(null),
        ]);

        const groups = await ctx.db.locationGroup.findMany({
          where: {
            ...liveGroupWhere(ctx),
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
  /**
   * The signed-in viewer's own cards, one page at a time.
   *
   * Driven off `LocationConsumer` — the viewer's actual claims — rather than
   * by filtering `list` for `collected`. Three things follow from that, and
   * all three are the point:
   *
   *  1. Cost scales with the collection, not the platform. The binder used to
   *     download every approved drop in the world (~740 bytes each) and keep
   *     the handful that were the viewer's.
   *  2. One claim is one card. `list` marks *every* point in a non-`multiPin`
   *     group collected once you claim any one of them — correct for the map,
   *     where all five markers should go grey, but it meant a single claim on
   *     a five-point drop rendered as five identical cards in the binder.
   *  3. Owned cards stop vanishing. `list` only returns drops that are still
   *     live (`endDate >= now`, `remaining > 0`), so a card silently left the
   *     binder when its campaign ended. A claim is permanent; the card you
   *     hold is yours whether or not the drop is still running.
   *
   * No Horizon read here, unlike `list` and `byBrand`: lock state is only ever
   * about whether something *can* be claimed, and every row in this query
   * already has been.
   *
   * Rarity is derived (`deriveRarity` needs the creator's whole tier ladder),
   * so it is not a column and cannot be filtered, sorted or counted in SQL.
   * Filtering and sorting therefore happen in memory over the viewer's own
   * claims — bounded by their collection, which is the right size to hold.
   */
  collected: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(48).default(24),
        cursor: z.number().int().min(0).nullish(),
        rarity: z
          .enum(["all", "common", "rare", "epic", "legendary", "mythic"])
          .default("all"),
        query: z.string().max(120).default(""),
        sort: z.enum(["newest", "rarest", "brand"]).default("newest"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const offset = input.cursor ?? 0;

      const claims = await ctx.db.locationConsumer.findMany({
        // `Location.locationGroupId` is nullable, so a point can exist with no
        // drop behind it — no title, no art, no brand. Such a claim has
        // nothing to render as a card, so it is excluded here rather than
        // silently becoming an "Unknown brand" blank in someone's binder.
        // Only this platform's cards (every platform's on web.wadzzo.com).
        where: { userId, location: { locationGroup: ctx.platform.isRoot ? { isNot: null } : { is: platformScope(ctx) } } },
        include: {
          location: {
            include: { locationGroup: { include: groupWithLocationsInclude } },
          },
        },
      });

      const all = claims.flatMap((claim) => {
        const group = claim.location.locationGroup;
        // Narrowing for TypeScript; the `where` above already excluded these.
        if (!group) return [];
        return toPin(
          group,
          claim.location,
          {
            userId: claim.userId,
            redeemCode: claim.redeemCode,
            isRedeemed: claim.isRedeemed,
            claimedAt: claim.claimedAt,
            createdAt: claim.createdAt,
          },
          null,
          groupFacts(group),
        );
      });

      // Facets describe the whole collection, not the filtered view — the
      // rarity chips have to be able to say "you own none of these" rather
      // than disappearing once a filter is on.
      const counts = RARITY_ORDER.reduce<Record<string, number>>((acc, r) => {
        acc[r] = 0;
        return acc;
      }, {});
      for (const pin of all) counts[pin.rarity] = (counts[pin.rarity] ?? 0) + 1;

      const facets = {
        total: all.length,
        brands: new Set(all.map((p) => p.brandId)).size,
        best: all.reduce<Rarity>(
          (acc, p) =>
            RARITY_ORDER.indexOf(p.rarity) > RARITY_ORDER.indexOf(acc)
              ? p.rarity
              : acc,
          "common",
        ),
        counts,
      };

      const q = input.query.trim().toLowerCase();
      const matching = all
        .filter((pin) => {
          if (input.rarity !== "all" && pin.rarity !== input.rarity) {
            return false;
          }
          if (!q) return true;
          return (
            pin.title.toLowerCase().includes(q) ||
            pin.brandName.toLowerCase().includes(q) ||
            pin.description.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => {
          if (input.sort === "rarest") {
            return (
              RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity)
            );
          }
          if (input.sort === "brand") {
            return a.brandName.localeCompare(b.brandName);
          }
          return (
            new Date(b.collectedAt ?? 0).getTime() -
            new Date(a.collectedAt ?? 0).getTime()
          );
        });

      const pins = matching.slice(offset, offset + input.limit);
      const next = offset + pins.length;
      return {
        pins,
        total: matching.length,
        nextCursor: next < matching.length ? next : null,
        facets,
      };
    }),

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
      const { location, group } = await assertClaimable(
        ctx.db,
        userId,
        input.locationId,
        ctx,
      );

      // ── Geofence ──────────────────────────────────────────────────────────
      // The client already hides the button out of range; this is what makes
      // that mean something. `consume.ts` in the reference took only a
      // location id and never checked where the caller was, so anything that
      // could reach the API could claim every pin on the map without moving.
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

      return writeClaim(ctx.db, userId, location, group, ctx.platform.id);
    }),

  /**
   * Claim a pin by scanning its QR code.
   *
   * The QR replaces the geofence rather than escaping it. A creator prints or
   * shares the code for a specific drop, and holding it is itself the proof of
   * presence the GPS check would otherwise establish — the whole point is that
   * this works indoors, in a basement, at a stall with no signal, where a fix
   * is either unavailable or wrong by a hundred metres.
   *
   * Everything that is *not* about location still applies: the drop has to be
   * approved, live, in stock, and the collector still has to clear whatever
   * gate it sits behind (follow the brand, hold the tier). Scanning a
   * followers-only drop you don't follow fails with the same "Follow this
   * brand to unlock" as walking up to it would.
   *
   * ⚠ Trust model, stated plainly: the pin id *is* the credential. Anyone who
   * obtains the code — a forwarded screenshot, a photo of a poster, the id
   * read off a URL — can claim from anywhere. That is inherent to "print it
   * and let people scan it", and it matches the reference implementation,
   * which gates its equivalent on nothing at all. If a drop needs to resist
   * that, it wants a per-scan token, not a static QR.
   */
  collectByQr: protectedProcedure
    .input(z.object({ locationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { location, group } = await assertClaimable(
        ctx.db,
        userId,
        input.locationId,
        ctx,
      );
      return writeClaim(ctx.db, userId, location, group, ctx.platform.id);
    }),
});
