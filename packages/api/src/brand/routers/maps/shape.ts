import { z } from "zod";

import { AppError, ErrorCodes } from "@wadzzo/errors";
import { assertInPlatformScope } from "@wadzzo/platform/server";
import { shapePathSchema } from "@wadzzo/schemas/pin-look";

import { withAiQuota } from "../../server/ai/openai";
import {
  decodeDataUrl,
  enhanceSilhouette,
  fetchReference,
  generateSilhouette,
} from "../../server/ai/silhouette";

import { assertOwnerOrAdmin, resolveActingBrand } from "../../access";
import { createTRPCRouter, protectedProcedure } from "../../trpc";

type Ctx = Parameters<typeof assertOwnerOrAdmin>[0];

/** A brand can keep this many shapes (archived ones don't count). */
export const MAX_SHAPES_PER_BRAND = 100;

const SELECT = {
  id: true,
  name: true,
  path: true,
  anchor: true,
  archived: true,
  updatedAt: true,
} as const;

const shapeInput = z.object({
  name: z.string().trim().min(1, "Give the shape a name").max(40, "Keep the name short"),
  path: shapePathSchema,
  anchor: z.enum(["center", "bottom"]).default("center"),
});

/** Loads a shape and checks the caller may change it. */
async function owned(ctx: Ctx, id: string) {
  const shape = await ctx.db.pinShape.findUnique({
    where: { id },
    select: { id: true, creatorId: true, platformId: true, name: true },
  });
  if (!shape) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Shape not found" });
  assertInPlatformScope(ctx, shape.platformId);
  await assertOwnerOrAdmin(ctx, shape.creatorId);
  return shape;
}

/** How many pins, hotspots and templates draw with a shape. */
async function usageOf(ctx: Ctx, id: string, creatorId: string) {
  const [pins, hotspots, templates] = await Promise.all([
    ctx.db.locationGroup.count({ where: { pinShapeId: id, hidden: false } }),
    ctx.db.hotspot.count({ where: { pinShapeId: id, hidden: false } }),
    ctx.db.pinTemplate.count({
      where: { creatorId, data: { path: ["look", "shape"], equals: id } },
    }),
  ]);
  return { pins, hotspots, templates, total: pins + hotspots + templates };
}

/**
 * A brand's own pin shapes (the built-in ones live in @wadzzo/schemas/pin-look).
 * A shape in use is archived rather than deleted, so its pins keep drawing it.
 */
export const shapeRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({ creatorId: z.string().optional(), archived: z.boolean().optional() }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const { creatorId } = await resolveActingBrand(ctx, input?.creatorId);
      return ctx.db.pinShape.findMany({
        where: { creatorId, archived: input?.archived ?? false },
        select: SELECT,
        orderBy: { updatedAt: "desc" },
      });
    }),

  usage: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const shape = await owned(ctx, input.id);
    return usageOf(ctx, shape.id, shape.creatorId);
  }),

  create: protectedProcedure
    .input(shapeInput.extend({ creatorId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { creatorId, platformId } = await resolveActingBrand(ctx, input.creatorId);
      const count = await ctx.db.pinShape.count({ where: { creatorId, archived: false } });
      if (count >= MAX_SHAPES_PER_BRAND)
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: `You can keep up to ${MAX_SHAPES_PER_BRAND} shapes — archive some you no longer use`,
        });
      return ctx.db.pinShape.create({
        data: { creatorId, platformId, name: input.name, path: input.path, anchor: input.anchor },
        select: SELECT,
      });
    }),

  /** Changes the shape in place: every pin, hotspot and template using it changes too. */
  update: protectedProcedure
    .input(shapeInput.partial().extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await owned(ctx, input.id);
      return ctx.db.pinShape.update({
        where: { id: input.id },
        data: { name: input.name, path: input.path, anchor: input.anchor },
        select: SELECT,
      });
    }),

  /** Hides a shape from the picker (pins already using it keep it), or brings it back. */
  archive: protectedProcedure
    .input(z.object({ id: z.string(), archived: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      await owned(ctx, input.id);
      return ctx.db.pinShape.update({
        where: { id: input.id },
        data: { archived: input.archived },
        select: SELECT,
      });
    }),

  /**
   * Pin Studio's AI: one black silhouette for a description, optionally based on
   * a reference image and/or link. Counts as one AI image (the brand's shared
   * daily limit, only when it succeeds). The browser traces the result into an
   * outline; nothing is stored here.
   */
  ai: protectedProcedure
    .input(
      z.object({
        creatorId: z.string().optional(),
        description: z.string().trim().min(3, "Describe the shape").max(600),
        /** A data URL (PNG / JPG / WebP) the browser made from an uploaded file. */
        referenceImage: z.string().max(12_000_000).optional(),
        referenceUrl: z.url("Paste a full link, starting with https://").max(2000).optional(),
        /** The brand confirms it may use the reference. */
        rights: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await resolveActingBrand(ctx, input.creatorId);
      const hasReference = Boolean(input.referenceImage ?? input.referenceUrl);
      if (hasReference && !input.rights)
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: "Confirm you can use the reference first",
        });
      // References are read before the AI runs, so a bad link doesn't use up a generation.
      const references = [
        ...(input.referenceImage ? [decodeDataUrl(input.referenceImage)] : []),
        ...(input.referenceUrl ? [await fetchReference(input.referenceUrl)] : []),
      ];
      const image = await withAiQuota(ctx.session.user.id, "image", () =>
        generateSilhouette(input.description, references),
      );
      return { image };
    }),

  /**
   * Pin Studio's "Enhance with AI": the brand's current outline, redrawn
   * cleaner, more even and more polished (plus an optional instruction). The
   * server draws the outline itself, so only the brand's own drawing is sent.
   * Counts as one AI image (shared daily limit, only when it succeeds); the
   * browser traces the result and the brand chooses whether to use it.
   */
  enhance: protectedProcedure
    .input(
      z.object({
        creatorId: z.string().optional(),
        path: shapePathSchema,
        instruction: z.string().trim().max(300, "Keep the instruction short").optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await resolveActingBrand(ctx, input.creatorId);
      const image = await withAiQuota(ctx.session.user.id, "image", () =>
        enhanceSilhouette(input.path, input.instruction),
      );
      return { image };
    }),

  /** Deletes a shape nothing uses; a shape in use must be archived instead. */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const shape = await owned(ctx, input.id);
      const usage = await usageOf(ctx, shape.id, shape.creatorId);
      if (usage.total > 0)
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: "This shape is in use — archive it instead",
        });
      await ctx.db.pinShape.delete({ where: { id: shape.id } });
      return { id: shape.id };
    }),
});
