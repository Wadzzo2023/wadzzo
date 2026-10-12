import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "../..";

/**
 * ── coins ──────────────────────────────────────────────────────────────────
 *
 * Wadzzo Coins: an off-chain balance earned from mural scans. Read-only for
 * users; redeeming isn't built yet (the UI says "Redeem coming soon").
 */
export const coinsRouter = createTRPCRouter({
  balance: protectedProcedure.query(async ({ ctx }) => {
    // each platform (site) has its own balance
    const row = await ctx.db.coinBalance.findUnique({
      where: {
        userId_platformId: {
          userId: ctx.session.user.id,
          platformId: ctx.platform.id,
        },
      },
    });
    return { balance: row?.balance ?? 0 };
  }),

  history: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.coinLedger.findMany({
        // the same balance `balance` reads: coins earned on this platform
        where: { userId: ctx.session.user.id, platformId: ctx.platform.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          amount: true,
          reason: true,
          note: true,
          createdAt: true,
          mural: { select: { id: true, title: true, autoTitle: true } },
        },
      });
      const more = rows.length > input.limit;
      const items = rows.slice(0, input.limit).map(({ mural, ...r }) => ({
        ...r,
        mural: mural ? { id: mural.id, title: mural.title ?? mural.autoTitle } : null,
      }));
      return { items, nextCursor: more ? items[items.length - 1]!.id : null };
    }),
});
