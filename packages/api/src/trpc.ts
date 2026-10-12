import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod";

import { AppError, ErrorCodes, isAppError } from "@wadzzo/errors";
import { appErrorMiddleware } from "@wadzzo/errors/trpc";

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
 * A procedure anyone can call (the session is available when they are signed in).
 * An `AppError` thrown anywhere below becomes the matching tRPC error.
 */
export const publicProcedure = t.procedure.use(t.middleware(appErrorMiddleware));

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
