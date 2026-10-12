import {
  createCallerFactory,
  createInnerTrpcContext,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  createTrpcContext,
} from "@wadzzo/api";
import type { CreateNextContextOptions } from "@trpc/server/adapters/next";
import { AppError, ErrorCodes } from "@wadzzo/errors";
import { brandWorksOnPlatform, canAdminPlatform } from "@wadzzo/platform/scope";

export { createCallerFactory, createTRPCRouter, protectedProcedure, publicProcedure };
export const createInnerTRPCContext = createInnerTrpcContext;

/** Context for every tRPC request (pages-router adapter): session, platform, db. */
export const createTRPCContext = (opts: CreateNextContextOptions) => createTrpcContext(opts);

export const adminProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED);
  }

  const admin = await ctx.db.admin.findUnique({
    where: { id: ctx.session.user.id },
    select: { platformId: true, platform: { select: { isRoot: true } } },
  });

  // An admin manages their own platform's panel; root-platform (wadzzo) admins manage every panel.
  if (!admin || !canAdminPlatform(admin, ctx.platform)) {
    throw new AppError(ErrorCodes.AUTH_ADMIN_ONLY, { message: "Admin access required" });
  }

  return next({
    ctx: {
      // infers the `session` as non-nullable
      session: { ...ctx.session, user: ctx.session.user },
      isSuperAdmin: admin.platform.isRoot,
    },
  });
});

/** Wadzzo (root-platform) admins, on any platform's site: platform management, audit log, cross-platform admin. */
export const superAdminProcedure = adminProcedure.use(({ ctx, next }) => {
  if (!ctx.isSuperAdmin) {
    throw new AppError(ErrorCodes.AUTH_ADMIN_ONLY, { message: "Wadzzo admin access required" });
  }
  return next();
});

export const creatorProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED);
  }

  const creator = await ctx.db.creator.findUnique({
    where: { id: ctx.session.user.id },
  });

  if (!creator || !creator.aprovalSend || creator.approved !== true) {
    throw new AppError(ErrorCodes.AUTH_NOT_A_CREATOR, {
      message: "Creator access requires an approved brand account",
    });
  }

  // A brand belongs to one platform and works in that platform's panel, or in the root (Wadzzo) one.
  if (!brandWorksOnPlatform(ctx.platform, creator.platformId)) {
    throw new AppError(ErrorCodes.PLATFORM_FORBIDDEN, {
      message: `This brand belongs to another platform (${creator.platformId})`,
    });
  }

  return next({
    ctx: {
      // infers the `session` as non-nullable
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});
