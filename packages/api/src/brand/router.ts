import { createTRPCRouter } from "./trpc";
import { fanRouter } from "./routers/fan/root";
import { marketplaceRouter } from "./routers/marketplace/root";
import { walletRouter } from "./routers/wallet/root";
import { authRouter } from "./routers/auth/root";
import { mapsRouter } from "./routers/maps/root";
import { gameRouter } from "./routers/game";
import { walletBalanceRouter } from "./routers/wallet-balance/root";
import { adminRouter } from "./routers/admin/root";
import { BountyRouters } from "./routers/bounty/root";
import { s3Router } from "./routers/s3";
import { widgetRouter } from "./routers/widget";
import { qrRouter } from "./routers/qr";
import { agentRouter } from "./routers/agent";
import { aiRouter } from "./routers/ai";
import { pinAgentRouter } from "./routers/pin-agent";
import { tagRouter } from "./routers/tags";
import { eventsRouter } from "./routers/events";
import { embedsRouter } from "./routers/embeds";
import { homeAreaRouter } from "./routers/home-area";
/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  fan: fanRouter,
  marketplace: marketplaceRouter,
  wallet: walletRouter,
  auth: authRouter,
  maps: mapsRouter,
  game: gameRouter,
  walletBalance: walletBalanceRouter,
  admin: adminRouter,
  bounty: BountyRouters,
  s3: s3Router,
  widget: widgetRouter,
  qr: qrRouter,
  agent: agentRouter,
  pinAgent: pinAgentRouter,
  ai: aiRouter,
  tag: tagRouter,
  events: eventsRouter,
  embeds: embedsRouter,
  homeArea: homeAreaRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
