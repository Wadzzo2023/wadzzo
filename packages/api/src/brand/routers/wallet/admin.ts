import { z } from "zod";

import { getPlatformAdmin } from "../../access";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../../trpc";
import { logAudit } from "@wadzzo/platform/server";
import { isInPlatformScope, platformScope } from "@wadzzo/platform/server";
import { AppError, ErrorCodes } from "@wadzzo/errors";

export const adminRouter = createTRPCRouter({
  /** The caller's admin access on this deployment (undefined when not an admin here). */
  checkAdmin: protectedProcedure.query(async ({ ctx }) => {
    const admin = await getPlatformAdmin(ctx);
    if (admin) {
      return {
        ...admin,
        // A Wadzzo admin has full control on every platform's site.
        isSuperAdmin: admin.platform.isRoot,
        platform: {
          id: ctx.platform.id,
          name: ctx.platform.name,
          isRoot: ctx.platform.isRoot,
        },
      };
    }
  }),
  makeAdmin: adminProcedure
    .input(
      z
        .object({
          pubkey: z.string().trim().length(56).optional(),
          /** Alternative to `pubkey`: the email of an existing account, resolved to its public key. */
          email: z.string().trim().email().optional(),
          /** Wadzzo admins may add an admin to another platform; defaults to this one. */
          platformId: z.string().optional(),
        })
        .refine((v) => Boolean(v.pubkey) !== Boolean(v.email), {
          message: "Give either a public key or an email.",
        }),
    )
    .mutation(async ({ input, ctx }) => {
      const platformId = input.platformId ?? ctx.platform.id;
      // A platform's admins add admins to their own platform; a Wadzzo admin can add to any.
      if (!ctx.isSuperAdmin && !isInPlatformScope(ctx, platformId))
        throw new AppError(ErrorCodes.AUTH_ADMIN_ONLY, {
          message: "You can only add admins to your own platform.",
        });
      if (
        !(await ctx.db.platform.findUnique({
          where: { id: platformId },
          select: { id: true },
        }))
      ) {
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Unknown platform." });
      }
      const user = input.email
        ? await ctx.db.user.findFirst({
            where: { email: { equals: input.email, mode: "insensitive" } },
            select: { id: true },
          })
        : await ctx.db.user.findUnique({
            where: { id: input.pubkey },
            select: { id: true },
          });
      if (!user)
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
          message: input.email
            ? "No account uses that email — they need to sign up with it first."
            : "No account has that public key — they need to sign in once first.",
        });
      const pubkey = user.id;
      const existing = await ctx.db.admin.findUnique({
        where: { id: pubkey },
        select: { platformId: true },
      });
      if (existing) {
        if (existing.platformId === platformId)
          throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
            message: "That account is already an admin.",
          });
        // An account is an admin of one platform. Only Wadzzo can move one to another (e.g. promote a
        // Clinton County admin to Wadzzo admin); a platform's own admins can't take another's.
        if (!ctx.isSuperAdmin)
          throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
            message: `That account is already an admin of ${existing.platformId}.`,
          });
        if (pubkey === ctx.session.user.id)
          throw new AppError(ErrorCodes.VALIDATION_FAILED, {
            message: "You can't change your own admin platform.",
          });
        await ctx.db.admin.update({
          where: { id: pubkey },
          data: { platformId },
        });
        await logAudit(ctx, {
          action: "admin.move",
          entityType: "Admin",
          entityId: pubkey,
          targetPlatformId: platformId,
          meta: { from: existing.platformId, to: platformId },
        });
        return { moved: true as const, from: existing.platformId };
      }
      await ctx.db.admin.create({ data: { id: pubkey, platformId } });
      await logAudit(ctx, {
        action: "admin.add",
        entityType: "Admin",
        entityId: pubkey,
        targetPlatformId: platformId,
      });
      return { moved: false as const, from: null };
    }),

  admins: adminProcedure
    .input(z.object({ platformId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.admin.findMany({
        where: platformScope(ctx, input?.platformId),
        orderBy: { joinedAt: "asc" },
        select: {
          id: true,
          joinedAt: true,
          platformId: true,
          platform: { select: { name: true } },
          user: { select: { name: true, email: true, image: true } },
        },
      });
    }),
  deleteAdmin: adminProcedure.input(z.string().length(56)).mutation(async ({ input, ctx }) => {
    // Never lock a platform out: not yourself, and never its last admin.
    if (input === ctx.session.user.id)
      throw new AppError(ErrorCodes.VALIDATION_FAILED, {
        message: "You can't remove your own admin access.",
      });
    const target = await ctx.db.admin.findUnique({
      where: { id: input },
      select: { platformId: true },
    });
    if (!target || (!ctx.isSuperAdmin && !isInPlatformScope(ctx, target.platformId)))
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Admin not found." });
    if (
      (await ctx.db.admin.count({
        where: { platformId: target.platformId },
      })) <= 1
    ) {
      throw new AppError(ErrorCodes.VALIDATION_FAILED, {
        message: "There must always be at least one admin.",
      });
    }
    const removed = await ctx.db.admin.delete({ where: { id: input } });
    await logAudit(ctx, {
      action: "admin.remove",
      entityType: "Admin",
      entityId: input,
      targetPlatformId: target.platformId,
    });
    return removed;
  }),
});
