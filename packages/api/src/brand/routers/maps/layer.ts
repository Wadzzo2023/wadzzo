import { z } from "zod";

import type { Db } from "@wadzzo/db";
import { AppError, ErrorCodes } from "@wadzzo/errors";
import { assertInPlatformScope } from "@wadzzo/platform/server";
import { createLayerSchema, MAX_LAYERS_PER_BRAND, updateLayerSchema } from "@wadzzo/schemas/layer";

import { assertOwnerOrAdmin, resolveActingBrand } from "../../access";
import { createTRPCRouter, protectedProcedure } from "../../trpc";

/**
 * Map layers (docs/layers): a brand's own layers (Hospital, School…). On the base map the brand
 * selects one, and the pins, hotspots and trails it makes there go in it.
 */

type Ctx = Parameters<typeof assertOwnerOrAdmin>[0] & { db: Db };

/** Loads a layer and checks the caller may manage it (its brand, or an admin of its platform). */
async function ownedLayer(ctx: Ctx, id: string) {
  const layer = await ctx.db.pinLayer.findUnique({
    where: { id },
    select: { id: true, creatorId: true, platformId: true },
  });
  if (!layer) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Layer not found" });
  assertInPlatformScope(ctx, layer.platformId);
  await assertOwnerOrAdmin(ctx, layer.creatorId);
  return layer;
}

const LAYER_SELECT = {
  id: true,
  name: true,
  icon: true,
  color: true,
  _count: { select: { locationGroups: true, hotspots: true, trails: true } },
} as const;

export const layerRouter = createTRPCRouter({
  /** The brand's layers, by name, with how many pins, hotspots and trails are in each. */
  list: protectedProcedure
    .input(z.object({ creatorId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { creatorId } = await resolveActingBrand(ctx, input?.creatorId);
      const layers = await ctx.db.pinLayer.findMany({
        where: { creatorId },
        orderBy: { name: "asc" },
        select: LAYER_SELECT,
      });
      return layers.map(({ _count, ...l }) => ({
        ...l,
        pins: _count.locationGroups,
        hotspots: _count.hotspots,
        trails: _count.trails,
      }));
    }),

  /** A new layer. Names are free: a brand can have two "Hospital"s if it wants. */
  create: protectedProcedure.input(createLayerSchema).mutation(async ({ ctx, input }) => {
    const { creatorId, platformId } = await resolveActingBrand(ctx, input.creatorId);
    const count = await ctx.db.pinLayer.count({ where: { creatorId } });
    if (count >= MAX_LAYERS_PER_BRAND)
      throw new AppError(ErrorCodes.VALIDATION_FAILED, {
        message: `A brand can have ${MAX_LAYERS_PER_BRAND} layers. Delete one first.`,
      });
    return ctx.db.pinLayer.create({
      data: { name: input.name, icon: input.icon, color: input.color, creatorId, platformId },
      select: { id: true, name: true, icon: true, color: true },
    });
  }),

  /** Renames a layer or changes its icon or colour. */
  update: protectedProcedure.input(updateLayerSchema).mutation(async ({ ctx, input }) => {
    const layer = await ownedLayer(ctx, input.id);
    return ctx.db.pinLayer.update({
      where: { id: layer.id },
      data: { name: input.name, icon: input.icon, color: input.color },
      select: { id: true, name: true, icon: true, color: true },
    });
  }),

  /** Deletes a layer: its pins, hotspots and trails become regular ones again. */
  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const layer = await ownedLayer(ctx, input.id);
      // The foreign keys set layerId to null on the pins, hotspots and trails.
      await ctx.db.pinLayer.delete({ where: { id: layer.id } });
      return { id: layer.id };
    }),
});
