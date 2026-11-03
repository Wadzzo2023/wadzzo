import { fanBountyRouter } from "../shared/bounty";
import { brandsRouter } from "./routers/brands";
import { coinsRouter } from "./routers/coins";
import { marketRouter } from "../market/routers/market";
import { eventsRouter } from "./routers/events";
import { muralsRouter } from "./routers/murals";
import { claimRouter } from "./routers/claim";
import { pinsRouter } from "./routers/pins";
import { userRouter } from "./routers/user";
import { createTRPCRouter } from "../trpc";

export const appRouter = createTRPCRouter({
  pins: pinsRouter,
  claim: claimRouter,
  brands: brandsRouter,
  user: userRouter,
  bounty: fanBountyRouter,
  events: eventsRouter,
  murals: muralsRouter,
  coins: coinsRouter,
  // The fan marketplace, read-only (every procedure is a public query): AR lists items and
  // sends people to the marketplace app to buy.
  market: marketRouter,
});

export type AppRouter = typeof appRouter;
