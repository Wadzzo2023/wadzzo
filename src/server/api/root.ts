import { brandsRouter } from "./routers/brands";
import { pinsRouter } from "./routers/pins";
import { userRouter } from "./routers/user";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  pins: pinsRouter,
  brands: brandsRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
