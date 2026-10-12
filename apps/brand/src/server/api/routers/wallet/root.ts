import { createTRPCRouter } from "~/server/api/trpc";
import { assetRouter } from "./asset";
import { accountRouter } from "./account";
import { adminRouter } from "./admin";
import { tagRouter } from "./tag";
/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const walletRouter = createTRPCRouter({
  asset: assetRouter,
  account: accountRouter,
  admin: adminRouter,
  tag: tagRouter,
});

// export type definition of API
