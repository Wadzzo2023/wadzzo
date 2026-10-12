import {
  createCallerFactory,
  createInnerTrpcContext,
  createTRPCRouter,
  createTrpcContext,
  protectedProcedure,
  publicProcedure,
} from "@wadzzo/api";
import { AppError, ErrorCodes } from "@wadzzo/errors";
import { canAdminPlatform } from "@wadzzo/platform/scope";

export { createCallerFactory, createTRPCRouter, protectedProcedure, publicProcedure };
export const createInnerTRPCContext = createInnerTrpcContext;

/** Context for every tRPC request (App Router fetch handler): session, platform, db. */
export const createTRPCContext = () => createTrpcContext();

export const adminProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED);
  }

  if (ctx.session && ctx.session.user) {
    const admin = await ctx.db.admin.findUnique({
      where: { id: ctx.session.user.id },
      select: { platformId: true, platform: { select: { isRoot: true } } },
    });

    if (!admin || !canAdminPlatform(admin, ctx.platform))
      throw new AppError(ErrorCodes.AUTH_REQUIRED);
  }

  return next({
    ctx: {
      // infers the `session` as non-nullable
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

export const creatorProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED);
  }

  if (ctx.session && ctx.session.user) {
    const creator = await ctx.db.creator.findUnique({
      where: { id: ctx.session.user.id },
    });

    if (!creator || creator.platformId !== ctx.platform.id)
      throw new AppError(ErrorCodes.AUTH_REQUIRED);
  }

  return next({
    ctx: {
      // infers the `session` as non-nullable
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});
