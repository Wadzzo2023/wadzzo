import { createTRPCRouter } from "../../trpc";
import { trxRouter } from "./transactions";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const authRouter = createTRPCRouter({
  trx: trxRouter,
});

// export type definition of API
