import { sign } from "crypto";
import { z } from "zod";
import { custodialSignerSchema } from "@wadzzo/wallet/shared";
import {
  AddAssetTrustLine,
  BalanceWithHomeDomain,
  AcceptClaimableBalance,
  NativeBalance,
  PendingAssetList,
  RecentTransactionHistory,
  SendAssets,
  DeclineClaimableBalance,
  CheckHasTrustLineOnPlatformAsset,
  PlatformAssetBalance,
} from "../../lib/stellar/wallet-balance/wallet-balance";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../../trpc";
import { fetchCustodialAccountSecret } from "@wadzzo/wallet/server";
import { PLATFORM_ASSET } from "@wadzzo/wallet/config";
import { env } from "../../../env";
import { AppError, ErrorCodes } from "@wadzzo/errors";
import { horizonServer } from "@wadzzo/wallet/stellar";

export const WBalanceRouter = createTRPCRouter({
  getWalletsBalance: protectedProcedure.query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    return await BalanceWithHomeDomain({ userPub: userId });
  }),
  getGiftWithHomeBalance: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).nullish().default(10),
        cursor: z.string().nullish(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { limit, cursor } = input;
      const server = horizonServer();
      // Wadzzo and Bandcoin keep their known domains; a partner token uses its own home domain.
      const assetCode = PLATFORM_ASSET.code.toLowerCase();
      const homeDomain =
        assetCode === "wadzzo"
          ? "web.wadzzo.com"
          : assetCode === "bandcoin"
            ? "bandcoin.io"
            : env.NEXT_PUBLIC_HOME_DOMAIN;
      try {
        const claimableBalancesCall = server.claimableBalances();

        if (limit) {
          claimableBalancesCall.limit(limit);
        }
        if (cursor) {
          claimableBalancesCall.cursor(cursor);
        }
        console.log(ctx.session.user.id);
        const claimableBalances = await claimableBalancesCall.claimant(ctx.session.user.id).call();
        const filteredBalances = await Promise.all(
          claimableBalances.records.map(async (balance) => {
            const asset = balance.asset;
            if (!asset) return false;

            try {
              if (asset.includes(":")) {
                const [code, issuer] = asset.split(":");
                if (!issuer)
                  throw new AppError(ErrorCodes.VALIDATION_FAILED, {
                    message: "Issuer is undefined",
                  });

                const account = await server.loadAccount(issuer);
                console.log("account.home_domain", account.home_domain);

                return account.home_domain === homeDomain;
              }
              return false;
            } catch (error) {
              console.error("Error checking home_domain:", error);
              return false;
            }
          }),
        );
        const validBalances = claimableBalances.records.filter((_, i) => filteredBalances[i]);

        return {
          balances: validBalances,
          nextCursor:
            claimableBalances.records.length > 0
              ? claimableBalances.records[claimableBalances.records.length - 1]?.paging_token
              : undefined,
        };
      } catch (error) {
        console.error("Error fetching claimable balances:", error);
        throw new AppError(ErrorCodes.STELLAR_INSUFFICIENT_BALANCE, {
          message: "Failed to fetch claimable balances",
        });
      }
    }),

  getNativeBalance: protectedProcedure.query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    return await NativeBalance({ userPub: userId });
  }),
  sendWalletAssets: protectedProcedure
    .input(
      z.object({
        recipientId: z.string().min(1, {
          message: "Recipient Id is required.",
        }),
        amount: z.number().positive({
          message: "Amount must be greater than zero.",
        }),
        asset_code: z.string().min(1, {
          message: "Asset code is required.",
        }),
        asset_type: z.string().min(1, {
          message: "Asset type is required.",
        }),
        asset_issuer: z.string().min(1, {
          message: "Asset Issuer is required.",
        }),
        signWith: custodialSignerSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userPubKey = ctx.session.user.id;

      let secretKey;
      if (ctx.session.user.email && ctx.session.user.email.length > 0) {
        secretKey = await fetchCustodialAccountSecret(ctx.session.user.email);
      }
      return await SendAssets({
        userPubKey: userPubKey,
        recipientId: input.recipientId,
        amount: input.amount,
        asset_code: input.asset_code,
        asset_type: input.asset_type,
        asset_issuer: input.asset_issuer,
        signWith: input.signWith,
        secretKey: secretKey,
      });
    }),

  addTrustLine: protectedProcedure
    .input(
      z.object({
        // trustLimit: z.number().positive({
        //   message: "Trust Limit must be greater than zero.",
        // }),
        asset_code: z.string().min(1, {
          message: "Asset code is required.",
        }),

        asset_issuer: z.string().min(1, {
          message: "Asset Issuer is required.",
        }),
        signWith: custodialSignerSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userPubKey = ctx.session.user.id;
      let secretKey;
      if (ctx.session.user.email && ctx.session.user.email.length > 0) {
        secretKey = await fetchCustodialAccountSecret(ctx.session.user.email);
      }
      return await AddAssetTrustLine({
        userPubKey: userPubKey,
        asset_code: input.asset_code,
        asset_issuer: input.asset_issuer,
        signWith: input.signWith,
        secretKey: secretKey,
      });
    }),

  getTransactionHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).nullish().default(10),
        cursor: z.string().nullish(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const result = await RecentTransactionHistory({
        userPubKey: userId,
        input,
      });
      return {
        items: result.items,
        nextCursor: result.nextCursor,
      };
    }),

  getPendingAssetList: protectedProcedure.query(async ({ ctx, input }) => {
    const userPubKey = ctx.session.user.id;
    return await PendingAssetList({ userPubKey: userPubKey });
  }),

  claimBalance: protectedProcedure
    .input(
      z.object({
        // trustLimit: z.number().positive({
        //   message: "Trust Limit must be greater than zero.",
        // }),
        balanceId: z.string().min(1, {
          message: "BalanceId is required.",
        }),
        signWith: custodialSignerSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userPubKey = ctx.session.user.id;

      return await AcceptClaimableBalance({
        userPubKey: userPubKey,
        balanceId: input.balanceId,
        signWith: input.signWith,
      });
    }),

  declineClaimBalance: protectedProcedure
    .input(
      z.object({
        // trustLimit: z.number().positive({
        //   message: "Trust Limit must be greater than zero.",
        // }),
        balanceId: z.string().min(1, {
          message: "BalanceId is required.",
        }),
        signWith: custodialSignerSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userPubKey = ctx.session.user.id;
      let secretKey;
      if (ctx.session.user.email && ctx.session.user.email.length > 0) {
        secretKey = await fetchCustodialAccountSecret(ctx.session.user.email);
      }
      return await DeclineClaimableBalance({
        pubKey: userPubKey,
        balanceId: input.balanceId,
        signWith: input.signWith,
        secretKey: secretKey,
      });
    }),

  checkingPlatformTrustLine: protectedProcedure.query(async ({ ctx, input }) => {
    const userPubKey = ctx.session.user.id;
    return await CheckHasTrustLineOnPlatformAsset({ userPubKey: userPubKey });
  }),
  getPlatformAssetBalance: protectedProcedure.query(async ({ ctx, input }) => {
    const userPubKey = ctx.session.user.id;
    return await PlatformAssetBalance({ userPubKey: userPubKey });
  }),
});
