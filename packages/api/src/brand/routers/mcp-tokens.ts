// server/routers/mcp-tokens.ts
//
// Settings → AI connections: the person's MCP access tokens on this platform.
// A token is shown once, when it's created; after that only its prefix.
import { z } from "zod";

import { AppError, ErrorCodes } from "@wadzzo/errors";

import { generateMcpToken } from "../mcp/token";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const MAX_ACTIVE_TOKENS = 10;

export const mcpTokensRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.mcpToken.findMany({
      where: { userId: ctx.session.user.id, platformId: ctx.platform.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
    }),
  ),

  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const where = { userId: ctx.session.user.id, platformId: ctx.platform.id, revokedAt: null };
      if ((await ctx.db.mcpToken.count({ where })) >= MAX_ACTIVE_TOKENS)
        throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
          message: `You can have up to ${MAX_ACTIVE_TOKENS} tokens. Revoke one you no longer use.`,
        });

      const { token, tokenHash, prefix } = generateMcpToken();
      const row = await ctx.db.mcpToken.create({
        data: {
          userId: ctx.session.user.id,
          platformId: ctx.platform.id,
          name: input.name,
          tokenHash,
          prefix,
          walletType: ctx.session.user.walletType,
        },
        select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
      });
      return { ...row, token };
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.mcpToken.updateMany({
        where: { id: input.id, userId: ctx.session.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0)
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Token not found" });
      return { ok: true };
    }),
});
