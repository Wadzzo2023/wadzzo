import { z } from "zod";

import { signWithFor } from "~/lib/stellar/follow-creator";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { prepareClaim, quoteClaim, settleClaim } from "~/server/stellar/claim";

const method = z.enum(["PLATFORM_ASSET", "XLM"]).default("PLATFORM_ASSET");

/**
 * "Claim to wallet": deliver a collected pin's item on-chain.
 * quote (will it work, what it costs) → prepare (a transaction to sign,
 * holding the copy) → confirm (checked on Stellar after the wallet submits).
 */
export const claimRouter = createTRPCRouter({
  /**
   * Can this collected pin be claimed? `pinId` is the pin's id as the app uses
   * it (the location). Null when the viewer hasn't collected it or it has no item.
   */
  forPin: protectedProcedure.input(z.object({ pinId: z.string() })).query(async ({ ctx, input }) => {
    const consumer = await ctx.db.locationConsumer.findFirst({
      where: { userId: ctx.session.user.id, locationId: input.pinId },
      select: {
        id: true,
        claimTxId: true,
        location: { select: { locationGroup: { select: { asset: { select: { id: true, name: true, thumbnail: true } } } } } },
      },
    });
    const item = consumer?.location.locationGroup?.asset;
    if (!consumer || !item) return null;
    let state: "available" | "pending" | "delivered" = "available";
    if (consumer.claimTxId) {
      const tx = await ctx.db.assetTransaction.findUnique({ where: { id: consumer.claimTxId }, select: { status: true, expiresAt: true } });
      if (tx?.status === "SUCCESS") state = "delivered";
      else if (tx?.status === "PENDING" && (!tx.expiresAt || tx.expiresAt > new Date())) state = "pending";
    }
    return { consumerId: consumer.id, item, state, txId: consumer.claimTxId };
  }),

  quote: protectedProcedure
    .input(z.object({ consumerId: z.string(), method }))
    .query(({ ctx, input }) => quoteClaim(ctx, ctx.session.user.id, input.consumerId, input.method)),

  prepare: protectedProcedure
    .input(z.object({ consumerId: z.string(), method }))
    .mutation(({ ctx, input }) =>
      prepareClaim(ctx, { userId: ctx.session.user.id, consumerId: input.consumerId, method: input.method, signWith: signWithFor(ctx.session) }),
    ),

  /** After the wallet submitted the transaction: settle it from Horizon. */
  confirm: protectedProcedure.input(z.object({ txId: z.string() })).mutation(async ({ ctx, input }) => {
    const row = await ctx.db.assetTransaction.findUnique({ where: { id: input.txId }, select: { buyerId: true, type: true } });
    if (row?.type !== "CLAIM" || row.buyerId !== ctx.session.user.id) return null;
    const settled = await settleClaim(ctx.db, input.txId);
    return settled && { status: settled.status, error: settled.error };
  }),
});
