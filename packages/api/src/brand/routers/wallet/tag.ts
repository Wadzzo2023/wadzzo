import { z } from "zod";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../../trpc";

export const tagRouter = createTRPCRouter({
  getAllTags: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.adminAssetTag.findMany();
  }),
});
