import { Horizon } from "@stellar/stellar-sdk";
import { fetchCustodialAccountSecret } from "@wadzzo/wallet/server";
import { z } from "zod";
import { STELLAR_URL } from "@wadzzo/wallet/config";
import { claimRedeemXDR } from "~/lib/stellar/fan/redeem";
import { StellarAccount } from "@wadzzo/stellar/account";
import { custodialSignerSchema } from "@wadzzo/wallet/shared";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
export const UserAboutShema = z.object({
  bio: z
    .string()
    .max(100, { message: "Bio must be less than 101 characters" })
    .nullable(),
  name: z
    .string()
    .min(3, { message: "Name must be greater than 2 characters." })
    .max(20, { message: "Name must be less than 21 characters." }),
  profileUrl: z.string().nullable().optional(),
});
export const userRouter = createTRPCRouter({
  getUser: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.db.user.findUnique({ where: { id: ctx.session.user.id } });
  }),

  getUserById: publicProcedure
    .input(z.string())
    .query(async ({ input, ctx }) => {
      const user = await ctx.db.user.findUnique({ where: { id: input } });
      return user;
    }),
  updateUserProfile: protectedProcedure
    .input(UserAboutShema)
    .mutation(async ({ ctx, input }) => {
      const { name, bio } = input;
      await ctx.db.user.update({
        data: { name, bio },
        where: { id: ctx.session.user.id },
      });
    }),

  changeUserProfilePicture: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.update({
        data: { image: input },
        where: { id: ctx.session.user.id },
      });
    }),

  claimReward: protectedProcedure
    .input(
      z.object({
        code: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const redeemCode = input.code;
      const updateRedeem = await ctx.db.redeem.update({
        where: { code: redeemCode },
        data: {
          redeemConsumers: {
            create: {
              userId: ctx.session.user.id,
            },
          },
        },
      });
      return updateRedeem;
    }),

  getClaimRewardXDR: protectedProcedure
    .input(
      z.object({
        code: z.string(),
        signWith: custodialSignerSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const redeemCode = input.code;
      const user = ctx.session.user.id;

      const getRedeem = await ctx.db.redeem.findUnique({
        where: { code: redeemCode.toLocaleUpperCase() },
        select: {
          _count: {
            select: {
              redeemConsumers: true,
            },
          },
          totalRedeemable: true,
          assetRedeem: {
            select: {
              code: true,
              issuer: true,
              creatorId: true,
              limit: true,
            },
          },
          redeemConsumers: {
            where: {
              userId: user,
            },
          },
        },
      });

      if (!getRedeem) {
        throw new Error("Invalid redeem code");
      }

      if (getRedeem.assetRedeem.creatorId === user) {
        throw new Error("You can't claim your own reward");
      }

      if (
        getRedeem.redeemConsumers.find((consumer) => consumer.userId === user)
      ) {
        throw new Error("You have already claimed this reward");
      }

      if (getRedeem._count.redeemConsumers >= getRedeem.totalRedeemable) {
        throw new Error("Redeem code limit exceeded");
      }

      if (!getRedeem.assetRedeem.creatorId) {
        throw new Error("Creator does not exist");
      }

      const getStorageAcc = await ctx.db.creator.findUnique({
        where: {
          id: getRedeem.assetRedeem.creatorId,
        },
        select: {
          storagePub: true,
          storageSecret: true,
        },
      });

      if (!getStorageAcc) {
        throw new Error("Creator does not have a storage account");
      }

      const stroageACC = await StellarAccount.loadOrThrow(getStorageAcc.storagePub);
      const tokenNumber = stroageACC.tokenBalance(
        getRedeem.assetRedeem.code,
        getRedeem.assetRedeem.issuer,
      );

      if (tokenNumber < 1) {
        throw new Error("Insufficient token balance");
      }

      const UserAcc = await StellarAccount.loadOrThrow(user);
      const trust = UserAcc.hasTrustline(
        getRedeem.assetRedeem.code,
        getRedeem.assetRedeem.issuer,
      );

      if (!trust) {
        return claimRedeemXDR({
          userPub: user,
          creatorId: user,
          assetCode: getRedeem.assetRedeem.code,
          assetIssuer: getRedeem.assetRedeem.issuer,
          signWith: input.signWith,
          storageSecret: getStorageAcc.storageSecret,
        });
      } else {
        throw new Error("You have already has trust for this asset");
      }
    }),
  getClaimHistory: protectedProcedure.query(async ({ ctx }) => {
    const redeem = await ctx.db.redeem.findMany({
      where: {
        redeemConsumers: {
          some: {
            userId: ctx.session.user.id,
          },
        },
      },
    });
    return redeem;
  }),
});
