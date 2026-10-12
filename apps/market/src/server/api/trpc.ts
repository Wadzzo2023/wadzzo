import {
  createCallerFactory,
  createInnerTrpcContext,
  createTRPCRouter,
  createTrpcContext,
  protectedProcedure,
  publicProcedure,
} from "@wadzzo/api";

export { createCallerFactory, createTRPCRouter, protectedProcedure, publicProcedure };
export const createInnerTRPCContext = createInnerTrpcContext;

/** Context for every tRPC request (App Router fetch handler): session, platform, db. */
export const createTRPCContext = () => createTrpcContext();
