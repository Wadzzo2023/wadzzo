import { bountyRouter } from "./routers/bounty";
import { brandsRouter } from "./routers/brands";
import { coinsRouter } from "./routers/coins";
import { eventsRouter } from "./routers/events";
import { muralsRouter } from "./routers/murals";
import { claimRouter } from "./routers/claim";
import { pinsRouter } from "./routers/pins";
import { userRouter } from "./routers/user";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  pins: pinsRouter,
  claim: claimRouter,
  brands: brandsRouter,
  user: userRouter,
  bounty: bountyRouter,
  events: eventsRouter,
  murals: muralsRouter,
  coins: coinsRouter,
});

export type AppRouter = typeof appRouter;
