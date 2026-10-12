import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod";

import { AppError, ErrorCodes, isAppError } from "@wadzzo/errors";
import { appErrorMiddleware } from "@wadzzo/errors/trpc";
import { canAdminPlatform } from "@wadzzo/platform/scope";
import { assertSignerBelongsToSession } from "@wadzzo/wallet/shared";

import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        /** The stable application error code, when the failure was ours (`ErrorCodes.*`). */
        appCode: isAppError(error.cause) ? error.cause.code : null,
        zodError: error.cause instanceof ZodError ? z.flattenError(error.cause) : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const middleware = t.middleware;

/**
 * Procedures that sign for a custodial account take `signWith` from the
 * browser. It must name the caller (or, for `{ isAdmin }`, a real admin of
 * this platform): otherwise anyone could have the platform's key sign for them.
 */
const requireOwnSigner = t.middleware(async ({ ctx, getRawInput, next }) => {
  const rawInput = await getRawInput();
  if (typeof rawInput !== "object" || rawInput === null || !("signWith" in rawInput)) {
    return next();
  }

  const requested = rawInput.signWith;
  if (requested === undefined || requested === null) return next();

  const user = ctx.session?.user;
  if (!user) throw new AppError(ErrorCodes.AUTH_REQUIRED);

  await assertSignerBelongsToSession({
    requested,
    user,
    isPlatformAdmin: async () => {
      const admin = await ctx.db.admin.findUnique({
        where: { id: user.id },
        select: { platformId: true, platform: { select: { isRoot: true } } },
      });
      return admin !== null && canAdminPlatform(admin, ctx.platform);
    },
  });
  return next();
});

/**
 * A procedure anyone can call (the session is available when they are signed in).
 * An `AppError` thrown anywhere below becomes the matching tRPC error, and a
 * `signWith` in the input is checked against the session.
 */
export const publicProcedure = t.procedure
  .use(t.middleware(appErrorMiddleware))
  .use(requireOwnSigner);

/** A procedure for signed-in users: `ctx.session.user` is guaranteed. */
export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) throw new AppError(ErrorCodes.AUTH_REQUIRED);
  return next({
    ctx: {
      // narrows `session` to non-null
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});
