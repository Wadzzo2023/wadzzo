import { z } from "zod";

import { assertInPlatformScope } from "@wadzzo/platform/server";
import {
  createPinTemplateSchema,
  PIN_TEMPLATE_FORM_TYPES,
  updatePinTemplateSchema,
} from "@wadzzo/schemas/pin-template";

import { assertOwnerOrAdmin, resolveActingBrand } from "../../access";
import { pinTemplates } from "../../server/pin-templates";
import { createTRPCRouter, protectedProcedure } from "../../trpc";

type Ctx = Parameters<typeof assertOwnerOrAdmin>[0];

/** Loads a template and checks the caller may use it (its brand, or an admin of its platform). */
async function owned(ctx: Ctx, id: string) {
  const service = pinTemplates(ctx.db);
  const row = await service.find(id);
  assertInPlatformScope(ctx, row.platformId);
  await assertOwnerOrAdmin(ctx, row.creatorId);
  return { service, row };
}

/** Saved pin / hotspot setups: save, list, open, rename, change, duplicate, delete. */
export const templateRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          formType: z.enum(PIN_TEMPLATE_FORM_TYPES).optional(),
          creatorId: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { creatorId } = await resolveActingBrand(ctx, input?.creatorId);
      return pinTemplates(ctx.db).list(creatorId, input?.formType);
    }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const { service } = await owned(ctx, input.id);
    return service.get(input.id);
  }),

  create: protectedProcedure.input(createPinTemplateSchema).mutation(async ({ ctx, input }) => {
    const { creatorId, platformId } = await resolveActingBrand(ctx, input.creatorId);
    return pinTemplates(ctx.db).create(creatorId, platformId, input);
  }),

  update: protectedProcedure.input(updatePinTemplateSchema).mutation(async ({ ctx, input }) => {
    const { service } = await owned(ctx, input.id);
    return service.update(input.id, input);
  }),

  duplicate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { service } = await owned(ctx, input.id);
      return service.duplicate(input.id);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { service } = await owned(ctx, input.id);
      return service.remove(input.id);
    }),
});
