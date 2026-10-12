import { createCallerFactory, createTRPCRouter } from "..";

import { activityRouter } from "./routers/activity";
import { fanBountyRouter } from "../shared/bounty";
import { collectionRouter } from "./routers/collection";
import { contentRouter } from "./routers/content";
import { creatorRouter } from "./routers/creator";
import { marketRouter } from "./routers/market";
import { notificationRouter } from "./routers/notification";
import { postRouter } from "./routers/post";
import { purchaseRouter } from "./routers/purchase";
import { searchRouter } from "./routers/search";
import { supportRouter } from "./routers/support";
import { txRouter } from "./routers/tx";
import { userRouter } from "./routers/user";
import { walletRouter } from "./routers/wallet";

export const appRouter = createTRPCRouter({
  market: marketRouter,
  purchase: purchaseRouter,
  content: contentRouter,
  collection: collectionRouter,
  activity: activityRouter,
  tx: txRouter,
  creator: creatorRouter,
  post: postRouter,
  bounty: fanBountyRouter,
  notification: notificationRouter,
  user: userRouter,
  wallet: walletRouter,
  search: searchRouter,
  support: supportRouter,
});

export type AppRouter = typeof appRouter;

/** Server-side caller (server components): `createCaller(await createTRPCContext())`. */
export const createCaller = createCallerFactory(appRouter);
