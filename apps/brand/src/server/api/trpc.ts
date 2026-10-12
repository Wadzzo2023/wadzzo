import type { CreateNextContextOptions } from "@trpc/server/adapters/next";

import { createCallerFactory, createInnerTrpcContext, createTrpcContext } from "@wadzzo/api";

export { createCallerFactory };
export const createInnerTRPCContext = createInnerTrpcContext;

/** Context for every tRPC request (pages-router adapter): session, platform, db. */
export const createTRPCContext = (opts: CreateNextContextOptions) => createTrpcContext(opts);
