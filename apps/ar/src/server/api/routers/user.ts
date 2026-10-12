import { Prisma } from "@wadzzo/db";
import { deleteFirebaseUserByEmail } from "@wadzzo/wallet/server";
import { z } from "zod";

import { PLATFORM_ASSET } from "@wadzzo/wallet/config";
import { StellarAccount } from "@wadzzo/stellar/account";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { isOwnS3Url } from "@wadzzo/storage";
import { AppError, ErrorCodes } from "@wadzzo/errors";

/**
 * ── User ───────────────────────────────────────────────────────────────────
 *
 * Wallet-derived facts about the signed-in viewer that don't belong to any
 * one brand or drop, plus the viewer's own profile. Profile editing and
 * account deletion exist for the mobile app (the web has neither yet); they
 * mirror wadzz0's `api/game/user/update-profile-details` and `delete-user`.
 */
export const userRouter = createTRPCRouter({
  /**
   * The signed-in wallet's holding of the platform asset (`PLATFORM_ASSET` —
   * WADZZO in production, configured per-environment via
   * `NEXT_PUBLIC_ASSET_CODE`/`NEXT_PUBLIC_ASSET_ISSUER`), read live from
   * Horizon rather than stored — same reasoning as every tier check in
   * `pins.ts`: there is no balance column on `User`, and a holding can change
   * without this app ever seeing the transaction.
   *
   * `session.user.id` is the wallet's own Stellar public key (see
   * `server/auth.ts`), so no separate account lookup is needed to know whose
   * balance this is.
   */
  platformBalance: protectedProcedure.query(async ({ ctx }) => {
    const account = await StellarAccount.load(ctx.session.user.id);
    return {
      assetCode: PLATFORM_ASSET.code,
      // An account Horizon has never seen — or one that's never opened a
      // trustline to this specific asset — genuinely holds none of it. Not
      // an error case; `createOrNull`/`getTokenBalance` already resolve both
      // to the same honest zero.
      balance: account?.tokenBalance(PLATFORM_ASSET.code, PLATFORM_ASSET.issuer) ?? 0,
      hasTrustline: account?.hasTrustline(PLATFORM_ASSET.code, PLATFORM_ASSET.issuer) ?? false,
    };
  }),

  /** The viewer's own profile, with the counts the profile screen shows. */
  profile: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const user = await ctx.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        bio: true,
        image: true,
        coverImage: true,
        joinedAt: true,
        firstSignUpMethod: true,
        _count: { select: { followings: true, LocationConsumer: true } },
      },
    });
    if (!user) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "User not found" });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      bio: user.bio,
      image: user.image,
      coverImage: user.coverImage,
      joinedAt: user.joinedAt,
      signUpMethod: user.firstSignUpMethod,
      walletType: ctx.session.user.walletType,
      followingCount: user._count.followings,
      collectedCount: user._count.LocationConsumer,
    };
  }),

  /**
   * Same limits as wadzz0's `update-profile-details` (name 2–100, bio ≤200).
   * `name` is unique across the shared database, so a clash is reported as
   * a readable message rather than a 500.
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(100).optional(),
        bio: z.string().trim().max(200).nullable().optional(),
        image: z.url().nullable().optional(),
        coverImage: z.url().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      for (const url of [input.image, input.coverImage]) {
        if (url && !isOwnS3Url(url)) {
          throw new AppError(ErrorCodes.VALIDATION_FAILED, {
            message: "Images must be uploaded through the app",
          });
        }
      }
      try {
        await ctx.db.user.update({
          where: { id: ctx.session.user.id },
          data: {
            name: input.name,
            bio: input.bio,
            image: input.image,
            coverImage: input.coverImage,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
            message: "That name is already taken",
          });
        }
        throw e;
      }
      return { ok: true };
    }),

  /**
   * Permanently delete the viewer's account: their Firebase login (when they
   * signed up with one) and their `User` row, which cascades their follows,
   * claims, bounty activity and comments. Required by App Store review.
   *
   * Mirrors wadzz0's `delete-user`, with one guard it lacks: an account that
   * is also a brand (`Creator` row) is refused here. Deleting it would cascade
   * into the brand's page, drops and bounties — that belongs in wadzz0, not
   * behind a button in a fan app.
   */
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const user = await ctx.db.user.findUnique({
      where: { id: userId },
      select: { email: true, creator: { select: { id: true } } },
    });
    if (!user) return { deleted: true };
    if (user.creator) {
      throw new AppError(ErrorCodes.AUTH_FORBIDDEN, {
        message:
          "This account runs a brand. Delete it from wadzzo.com so the brand's drops and bounties are handled properly.",
      });
    }

    if (user.email) {
      // No Firebase user for this email (wallet sign-up) is fine; any other
      // failure means the login would survive the deletion, so it propagates.
      await deleteFirebaseUserByEmail(user.email);
    }

    await ctx.db.user.delete({ where: { id: userId } });
    return { deleted: true };
  }),
});
