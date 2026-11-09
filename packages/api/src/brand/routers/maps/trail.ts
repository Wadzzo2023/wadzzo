import { z } from "zod";

import { AppError, ErrorCodes } from "@wadzzo/errors";
import { pinLookInputSchema } from "@wadzzo/schemas/pin-look";
import { assertInPlatformScope, logAudit, platformScope } from "@wadzzo/platform/server";
import {
  readStopDefaults,
  saveTrailSchema,
  TRAIL_MODES,
  TRAIL_STATUSES,
} from "@wadzzo/schemas/trail";

import { assertOwnerOrAdmin, isAdmin, resolveActingBrand } from "../../access";
import { assistTrail } from "../../server/ai/trail-assist";
import { lookColumnsFor, lookData } from "../../server/pin-look";
import { routeSection } from "../../server/routing";
import { trails } from "../../server/trails";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../../trpc";

type Ctx = Parameters<typeof assertOwnerOrAdmin>[0];

/** Loads a trail and checks the caller may manage it (its brand, or an admin of its platform). */
async function owned(ctx: Ctx, id: string) {
  const service = trails(ctx.db);
  const row = await service.find(id);
  assertInPlatformScope(ctx, row.platformId);
  await assertOwnerOrAdmin(ctx, row.creatorId);
  return { service, row };
}

const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

const bounds = z.object({
  north: z.number().min(-90).max(90),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  west: z.number().min(-180).max(180),
});

/**
 * Map trails (docs/trails): a brand's ordered set of its pins plus the path between them.
 * The builder saves the whole trail at once (`save`); review is admin-only.
 */
export const trailRouter = createTRPCRouter({
  /** The brand's trails, newest change first. */
  list: protectedProcedure
    .input(
      z
        .object({
          creatorId: z.string().optional(),
          status: z.enum(TRAIL_STATUSES).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { creatorId } = await resolveActingBrand(ctx, input?.creatorId);
      return trails(ctx.db).list({ creatorId, status: input?.status });
    }),

  /** Trails crossing the map's view: the brand's own, or (admin map) every brand's. */
  listInView: protectedProcedure
    .input(z.object({ bounds, creatorId: z.string().optional(), all: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      const b = input.bounds;
      const inView = {
        minLat: { lte: b.north },
        maxLat: { gte: b.south },
        // a view across the antimeridian is rare for trails: skip the longitude filter then
        ...(b.west <= b.east ? { minLng: { lte: b.east }, maxLng: { gte: b.west } } : {}),
      };
      if (input.all) {
        // Admin map: every brand on this platform.
        if (!(await isAdmin(ctx)))
          throw new AppError(ErrorCodes.AUTH_ADMIN_ONLY, { message: "Admin access required" });
        return trails(ctx.db).list({ ...inView, ...platformScope(ctx), status: { not: "ENDED" } });
      }
      const { creatorId } = await resolveActingBrand(ctx, input.creatorId);
      return trails(ctx.db).list({ ...inView, creatorId, status: { not: "ENDED" } });
    }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const { service } = await owned(ctx, input.id);
    return service.get(input.id);
  }),

  /** Creates or updates the whole trail: details, stops, path, stop defaults and reward. */
  save: protectedProcedure.input(saveTrailSchema).mutation(async ({ ctx, input }) => {
    if (input.id) {
      const { row } = await owned(ctx, input.id);
      return trails(ctx.db).save({ creatorId: row.creatorId, platformId: row.platformId }, input);
    }
    const who = await resolveActingBrand(ctx, input.creatorId);
    return trails(ctx.db).save(who, input);
  }),

  /**
   * The street path for one section ([lng, lat] points: two stops plus any bends). Null when
   * no route is found, and the builder keeps the straight line.
   */
  routeSection: protectedProcedure
    .input(z.object({ mode: z.enum(TRAIL_MODES), points: z.array(lngLat).min(2).max(25) }))
    .mutation(({ input }) => routeSection(input.mode, input.points)),

  submit: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { service } = await owned(ctx, input.id);
      return service.submit(input.id);
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { service } = await owned(ctx, input.id);
      return service.archive(input.id);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { service } = await owned(ctx, input.id);
      return service.remove(input.id);
    }),

  /**
   * Gives pins the trail's stop style (its Stop defaults' look): only the look columns change,
   * everywhere the pin shows. "Use the trail's style?" for one pin, or "Update the look of all
   * N stops?" after the style changes.
   */
  applyStyle: protectedProcedure
    .input(
      z.object({
        pinIds: z.array(z.string()).min(1).max(100),
        look: pinLookInputSchema,
        creatorId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { creatorId } = await resolveActingBrand(ctx, input.creatorId);
      const columns = await lookColumnsFor(ctx.db, creatorId, input.look);
      const { count } = await ctx.db.locationGroup.updateMany({
        where: { id: { in: input.pinIds }, creatorId },
        data: lookData(columns!),
      });
      return { count };
    }),

  /** ✦ Assist: a name, description and clues written from the chosen stops (text only). */
  assist: protectedProcedure
    .input(
      z.object({
        creatorId: z.string().optional(),
        mode: z.enum(TRAIL_MODES).default("WALK"),
        title: z.string().max(80).optional(),
        stops: z
          .array(z.object({ title: z.string().max(120), lat: z.number(), lng: z.number() }))
          .min(2)
          .max(25),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { creatorId } = await resolveActingBrand(ctx, input.creatorId);
      return assistTrail(ctx.db, ctx.session.user.id, creatorId, input);
    }),

  stats: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const { service } = await owned(ctx, input.id);
    return service.stats(input.id);
  }),

  /** The trails a pin is a stop on ("On 2 trails" on the pin's card). */
  trailsForPin: protectedProcedure
    .input(z.object({ pinId: z.string() }))
    .query(async ({ ctx, input }) => {
      const pin = await ctx.db.locationGroup.findUnique({
        where: { id: input.pinId },
        select: { creatorId: true, platformId: true },
      });
      if (!pin) return [];
      assertInPlatformScope(ctx, pin.platformId);
      await assertOwnerOrAdmin(ctx, pin.creatorId);
      const rows = await ctx.db.trailStop.findMany({
        where: { locationGroupId: input.pinId, trail: { hidden: false } },
        select: {
          position: true,
          trail: { select: { id: true, title: true, color: true, status: true } },
        },
        orderBy: { trail: { updatedAt: "desc" } },
      });
      return rows.map((r) => ({ ...r.trail, position: r.position }));
    }),

  // ── Admin review ──────────────────────────────────────────────────────

  reviewQueue: adminProcedure.query(({ ctx }) =>
    trails(ctx.db).list({ status: "PENDING", ...platformScope(ctx) }),
  ),

  approve: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { service } = await owned(ctx, input.id);
    const t = await service.approve(input.id);
    await logAudit(ctx, { action: "trail.approve", entityType: "Trail", entityId: input.id });
    return t;
  }),

  reject: adminProcedure
    .input(z.object({ id: z.string(), note: z.string().trim().min(1, "Say what to fix").max(500) }))
    .mutation(async ({ ctx, input }) => {
      const { service } = await owned(ctx, input.id);
      const t = await service.reject(input.id, input.note);
      await logAudit(ctx, {
        action: "trail.reject",
        entityType: "Trail",
        entityId: input.id,
        meta: { note: input.note },
      });
      return t;
    }),
});
