import { NotificationType, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { ArBrand } from "~/lib/ar/types";
import { StellarAccount } from "~/lib/stellar/account";
import {
  buildFollowTrustlineXdr,
  creatorAsset,
  signWithFor,
} from "~/lib/stellar/follow-creator";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";

/**
 * ── Brands ─────────────────────────────────────────────────────────────────
 *
 * Ported from the main webapp's `api/game/{brands,follow,unfollow,
 * followed_brands}` REST endpoints.
 *
 * Following unlocks a brand's `PRIVATE` drops, but it is not a bare database
 * write — in Wadzzo, following a brand means holding a **trustline** to its
 * page asset. That's what makes tiers possible at all: a wallet that doesn't
 * trust the asset can't be sent the creator's token, and so can't clear any
 * tier. Following is the on-ramp to the whole gating system, not a bookmark.
 *
 * So it's two steps, matching the reference exactly:
 *
 *   1. `followXdr`  — returns either `alreadyTrusted` (the wallet already
 *                     trusts the asset, nothing to sign) or an XDR carrying
 *                     mother's 0.5 XLM reserve top-up plus a user-sourced
 *                     `changeTrust`.
 *   2. `follow`     — called only after that XDR is signed and submitted,
 *                     writes the `Follow` row and notifies the creator.
 *
 * Unfollow deliberately does NOT remove the trustline, matching the reference:
 * a trustline is the user's own on-chain relationship and may still hold a
 * balance. Only the row goes.
 */

const AVATAR_FALLBACK =
  "https://app.wadzzo.com/images/icons/avatar-icon.png";

/** `Creator.id` is a 56-char Stellar pubkey; show it the way the app does. */
const shortHandle = (id: string) => `${id.slice(0, 3)}…${id.slice(-3)}`;

const brandSelect = {
  id: true,
  name: true,
  bio: true,
  profileUrl: true,
  coverUrl: true,
  vanityURL: true,
  approved: true,
  pageAsset: { select: { thumbnail: true } },
  _count: { select: { followers: true } },
} as const;

type BrandRow = {
  id: string;
  name: string;
  bio: string | null;
  profileUrl: string | null;
  coverUrl: string | null;
  vanityURL: string | null;
  approved: boolean | null;
  pageAsset: { thumbnail: string | null } | null;
  _count: { followers: number };
};

function toArBrand(
  row: BrandRow,
  followed: boolean,
  pinCount: number,
  categories: string[],
): ArBrand {
  return {
    id: row.id,
    name: row.name,
    handle: row.vanityURL ?? shortHandle(row.id),
    tagline: null,
    bio: row.bio ?? "",
    /**
     * `profileUrl` first — it is the creator's actual profile picture, and it
     * is what the main webapp shows on the same creator's page, so the two
     * apps now agree on what a brand looks like.
     *
     * This used to prefer `pageAsset.thumbnail`, which is a different thing
     * entirely: the artwork for the brand's *token*, not a portrait of the
     * brand. Beyond being the wrong picture, it was the broken one — every
     * creator's `profileUrl` is on S3 and resolves, while page-asset artwork
     * lives on IPFS gateways, and the two brands whose thumbnails sit on the
     * public `ipfs.io` gateway (R Brand, Wadzzo) rendered as broken images
     * everywhere they appeared, because that gateway rate-limits and then
     * blocks outright.
     *
     * Kept as the fallback rather than dropped: a creator who never uploaded
     * a profile picture but does have a page asset is better represented by
     * their token art than by the generic avatar icon.
     */
    avatarUrl: row.profileUrl ?? row.pageAsset?.thumbnail ?? AVATAR_FALLBACK,
    coverUrl: row.coverUrl,
    verified: row.approved === true,
    followed,
    followers: row._count.followers,
    pinCount,
    categories,
    region: null,
  };
}

/**
 * Live drop counts and tag labels for a set of creators, in two grouped
 * queries rather than per-brand round trips.
 */
async function brandFacets(db: PrismaClient, creatorIds: string[]) {
  // Same definition of "live" the map uses, so a brand's count can't claim
  // pins the map won't show.
  const liveFilter = {
    creatorId: { in: creatorIds },
    approved: true,
    hidden: false,
    endDate: { gte: new Date() },
    remaining: { gt: 0 },
  };

  const [counts, tagRows] = await Promise.all([
    db.locationGroup.groupBy({
      by: ["creatorId"],
      where: liveFilter,
      _count: true,
    }),
    db.locationGroupTag.findMany({
      where: { locationGroup: liveFilter },
      select: { tag: { select: { label: true, creatorId: true } } },
    }),
  ]);

  const pinCounts = new Map(counts.map((c) => [c.creatorId, c._count]));

  const categories = new Map<string, Set<string>>();
  for (const { tag } of tagRows) {
    const set = categories.get(tag.creatorId) ?? new Set<string>();
    set.add(tag.label);
    categories.set(tag.creatorId, set);
  }

  return { pinCounts, categories };
}

export const brandsRouter = createTRPCRouter({
  /**
   * Every brand with a page asset, matching the reference endpoint's filter —
   * a creator who never minted one has nothing to gate or reward with, so
   * they'd be an empty shelf on the brands screen.
   */
  list: publicProcedure.query(async ({ ctx }): Promise<ArBrand[]> => {
    const userId = ctx.session?.user.id ?? null;

    const creators = await ctx.db.creator.findMany({
      where: { pageAsset: { isNot: null } },
      select: brandSelect,
      orderBy: { joinedAt: "desc" },
    });

    const ids = creators.map((c) => c.id);

    const [{ pinCounts, categories }, followed] = await Promise.all([
      brandFacets(ctx.db, ids),
      userId
        ? ctx.db.follow
            .findMany({
              where: { userId, creatorId: { in: ids } },
              select: { creatorId: true },
            })
            .then((rows) => new Set(rows.map((r) => r.creatorId)))
        : Promise.resolve(new Set<string>()),
    ]);

    return creators.map((c) =>
      toArBrand(
        c,
        followed.has(c.id),
        pinCounts.get(c.id) ?? 0,
        [...(categories.get(c.id) ?? [])].sort(),
      ),
    );
  }),

  /** One brand — for its page or a deep link, without fetching every brand. */
  byId: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<ArBrand> => {
      const userId = ctx.session?.user.id ?? null;
      const creator = await ctx.db.creator.findFirst({
        where: { id: input.id, pageAsset: { isNot: null } },
        select: brandSelect,
      });
      if (!creator) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
      }
      const [{ pinCounts, categories }, follow] = await Promise.all([
        brandFacets(ctx.db, [creator.id]),
        userId
          ? ctx.db.follow.findFirst({
              where: { userId, creatorId: creator.id },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);
      return toArBrand(
        creator,
        Boolean(follow),
        pinCounts.get(creator.id) ?? 0,
        [...(categories.get(creator.id) ?? [])].sort(),
      );
    }),

  /** The brands this viewer follows — the `Following` filter's source. */
  followed: protectedProcedure.query(async ({ ctx }): Promise<ArBrand[]> => {
    const userId = ctx.session.user.id;

    const follows = await ctx.db.follow.findMany({
      where: { userId },
      select: { creator: { select: brandSelect } },
    });

    const creators = follows.map((f) => f.creator);
    const ids = creators.map((c) => c.id);
    const { pinCounts, categories } = await brandFacets(ctx.db, ids);

    return creators.map((c) =>
      toArBrand(
        c,
        true,
        pinCounts.get(c.id) ?? 0,
        [...(categories.get(c.id) ?? [])].sort(),
      ),
    );
  }),

  /**
   * Step 1: the trustline transaction to sign.
   *
   * Returns `{ alreadyTrusted: true }` when the wallet already trusts the
   * asset — the reference returns a bare `true` here and the client branches
   * on it; a named field is the same signal without the `xdr === true` trap.
   */
  followXdr: protectedProcedure
    .input(z.object({ brandId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (userId === input.brandId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't follow yourself",
        });
      }

      const creator = await ctx.db.creator.findUnique({
        where: { id: input.brandId },
        select: {
          pageAsset: { select: { code: true, issuer: true } },
          customPageAssetCodeIssuer: true,
        },
      });
      if (!creator) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
      }

      const asset = creatorAsset(creator);
      if (!asset) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This brand hasn't set up a page asset yet",
        });
      }

      const account = await StellarAccount.createOrNull(userId);
      if (account?.hasTrustline(asset.code, asset.issuer)) {
        return { alreadyTrusted: true as const, xdr: null };
      }

      const xdr = await buildFollowTrustlineXdr({
        userPubkey: userId,
        creatorPageAsset: asset,
        signWith: signWithFor(ctx.session),
      });

      return { alreadyTrusted: false as const, xdr };
    }),

  /**
   * Step 2: record the follow, after the trustline is on-chain.
   *
   * Verifies the trustline actually exists rather than trusting the client's
   * word — the reference skips this, which lets anyone unlock a brand's
   * PRIVATE drops by calling the follow endpoint directly and never signing
   * anything. Same hardening as the geofence on `pins.collect`.
   *
   * Horizon being unreachable is not treated as a failed trustline: an infra
   * hiccup shouldn't block a follow the user legitimately completed.
   *
   * Idempotent — a stale list or a double tap shouldn't produce a unique
   * constraint error when the user's intent is already satisfied.
   */
  follow: protectedProcedure
    .input(z.object({ brandId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (userId === input.brandId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't follow yourself",
        });
      }

      const creator = await ctx.db.creator.findUnique({
        where: { id: input.brandId },
        select: {
          id: true,
          pageAsset: { select: { code: true, issuer: true } },
          customPageAssetCodeIssuer: true,
        },
      });
      if (!creator) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
      }

      const existing = await ctx.db.follow.findUnique({
        where: { userId_creatorId: { userId, creatorId: creator.id } },
        select: { id: true },
      });
      if (existing) return { followed: true };

      const asset = creatorAsset(creator);
      if (asset) {
        const account = await StellarAccount.createOrNull(userId);
        if (account && !account.hasTrustline(asset.code, asset.issuer)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Trust ${asset.code} first — approve the wallet transaction to follow.`,
          });
        }
      }

      const follow = await ctx.db.follow.create({
        data: { userId, creatorId: creator.id },
      });

      // The notification goes TO the creator — `notifierId` is the recipient,
      // `actorId` the person who acted. Mirrors `fan.member.followCreator`.
      await ctx.db.notificationObject.create({
        data: {
          actorId: userId,
          entityType: NotificationType.FOLLOW,
          entityId: follow.id,
          isUser: false,
          Notification: {
            create: [{ notifierId: creator.id, isCreator: true }],
          },
        },
      });

      return { followed: true };
    }),

  /** Unfollow. Also idempotent — no row is the state being asked for. */
  unfollow: protectedProcedure
    .input(z.object({ brandId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.follow.deleteMany({
        where: { userId: ctx.session.user.id, creatorId: input.brandId },
      });
      return { followed: false };
    }),
});
