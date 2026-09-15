import { brandsRouter } from "./routers/brands";
import { pinsRouter } from "./routers/pins";
import { s3Router } from "./routers/s3";
import { userRouter } from "./routers/user";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  s3: s3Router,
  pins: pinsRouter,
  brands: brandsRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
