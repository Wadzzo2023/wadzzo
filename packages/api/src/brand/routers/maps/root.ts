import { createTRPCRouter } from "../../trpc";
import { layerRouter } from "./layer";
import { pinRouter } from "./pin";
import { reportRouter } from "./report";
import { shapeRouter } from "./shape";
import { templateRouter } from "./template";
import { trailRouter } from "./trail";
import { trxRouter } from "./transactions";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const mapsRouter = createTRPCRouter({
  layer: layerRouter,
  pin: pinRouter,
  report: reportRouter,
  shape: shapeRouter,
  template: templateRouter,
  trail: trailRouter,
  trx: trxRouter,
});

// export type definition of API
