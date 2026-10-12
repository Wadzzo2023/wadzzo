import { z } from "zod";

import { signWithFor } from "../server/stellar/follow-creator";
import { createTRPCRouter, protectedProcedure } from "../..";
import { claimOverview, prepareClaim, quoteClaim, settleClaim } from "../server/stellar/claim";

const method = z.enum(["PLATFORM_ASSET", "XLM"]).default("PLATFORM_ASSET");

/**
 * "Claim to wallet": deliver a collected pin's item on-chain.
 * quote (will it work, what it costs) → prepare (a transaction to sign,
 * holding the copy) → confirm (checked on Stellar after the wallet submits).
 */
export const claimRouter = createTRPCRouter({
  /**
   * What the viewer's collected pin offers: a reward to claim (an item or the brand's page
   * token) and where that stands, or nothing (a plain pin). `pinId` is the pin's id as the app
   * uses it (the location). Null when the viewer hasn't collected it.
   */
  forPin: protectedProcedure
    .input(z.object({ pinId: z.string() }))
    .query(({ ctx, input }) => claimOverview(ctx, ctx.session.user.id, input.pinId)),

  quote: protectedProcedure
    .input(z.object({ consumerId: z.string(), method }))
    .query(({ ctx, input }) =>
      quoteClaim(ctx, ctx.session.user.id, input.consumerId, input.method),
    ),

  prepare: protectedProcedure
    .input(z.object({ consumerId: z.string(), method }))
    .mutation(({ ctx, input }) =>
      prepareClaim(ctx, {
        userId: ctx.session.user.id,
        consumerId: input.consumerId,
        method: input.method,
        signWith: signWithFor(ctx.session),
      }),
    ),

  /** After the wallet submitted the transaction: settle it from Horizon. */
  confirm: protectedProcedure
    .input(z.object({ txId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.assetTransaction.findUnique({
        where: { id: input.txId },
        select: { buyerId: true, type: true },
      });
      if (row?.type !== "CLAIM" || row.buyerId !== ctx.session.user.id) return null;
      const settled = await settleClaim(ctx.db, input.txId);
      return settled && { status: settled.status, error: settled.error };
    }),
});
