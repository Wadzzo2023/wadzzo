import { z } from "zod";

import { distanceMeters } from "~/lib/ar/geo";
import { NEARBY_RADIUS_M } from "~/lib/murals/constants";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { localDay, timeZoneAt } from "~/server/murals/geo";
import { nameMural, startScan, submitScan } from "~/server/murals/scan";
import { boxAround, getMuralSettings, LIVE_MURAL, toMuralCard } from "~/server/murals/service";
import { platformScope } from "@wadzzo/platform/scope";

/**
 * ── murals ─────────────────────────────────────────────────────────────────
 *
 * User-discovered street art (docs/murals/plan.md). Reads are public; the
 * scan itself needs a session. Admin decisions live in the brand portal.
 *
 * Privacy: only `coverUrl` is ever public. Scan keyframes are returned to the
 * person who took them and nobody else.
 */

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

/** Today's scan count per mural for one viewer, each mural in its own zone. */
async function viewerToday(
  db: Parameters<typeof getMuralSettings>[0],
  userId: string | undefined,
  murals: { id: string; latitude: number; longitude: number }[],
) {
  const out = new Map<string, number>();
  if (!userId || murals.length === 0) return out;
  const scans = await db.muralScan.findMany({
    where: {
      userId,
      muralId: { in: murals.map((m) => m.id) },
      createdAt: { gte: new Date(Date.now() - 36 * 3600_000) },
    },
    select: { muralId: true, localDay: true },
  });
  for (const m of murals) {
    const day = localDay(timeZoneAt(m.latitude, m.longitude));
    out.set(m.id, scans.filter((s) => s.muralId === m.id && s.localDay === day).length);
  }
  return out;
}

export const muralsRouter = createTRPCRouter({
  /** Map + embed pins inside the viewport. */
  inArea: publicProcedure
    .input(
      z.object({
        north: lat,
        south: lat,
        east: lng,
        west: lng,
        includeUnverified: z.boolean().default(true),
      }),
    )
    .query(async ({ ctx, input }) => {
      const settings = await getMuralSettings(ctx.db);
      const murals = await ctx.db.mural.findMany({
        where: {
          ...LIVE_MURAL,
          ...platformScope(ctx),
          ...(input.includeUnverified ? {} : { status: "APPROVED" }),
          latitude: { gte: input.south, lte: input.north },
          longitude: input.west <= input.east ? { gte: input.west, lte: input.east } : undefined,
        },
        orderBy: { scanCount: "desc" },
        take: 300,
      });
      const today = await viewerToday(ctx.db, ctx.session?.user.id, murals);
      return {
        dailyLimit: settings.dailyScansPerMural,
        murals: murals.map((m) => ({
          ...toMuralCard(m, settings),
          scansToday: today.get(m.id) ?? 0,
        })),
      };
    }),

  /** Camera: what's close enough to pre-match against, with reference embeddings. */
  nearby: publicProcedure.input(z.object({ lat, lng })).query(async ({ ctx, input }) => {
    const settings = await getMuralSettings(ctx.db);
    const murals = await ctx.db.mural.findMany({
      where: {
        ...LIVE_MURAL,
        ...platformScope(ctx),
        ...boxAround(input.lat, input.lng, NEARBY_RADIUS_M),
      },
      include: { embeddings: { select: { vector: true } } },
    });
    const inRange = murals
      .map((m) => ({
        m,
        distanceM: distanceMeters(input, {
          lat: m.latitude,
          lng: m.longitude,
        }),
      }))
      .filter((x) => x.distanceM <= NEARBY_RADIUS_M)
      .sort((a, b) => a.distanceM - b.distanceM);
    const today = await viewerToday(
      ctx.db,
      ctx.session?.user.id,
      inRange.map((x) => x.m),
    );
    return {
      dailyLimit: settings.dailyScansPerMural,
      murals: inRange.map(({ m, distanceM }) => ({
        ...toMuralCard(m, settings),
        distanceM: Math.round(distanceM),
        scansToday: today.get(m.id) ?? 0,
        embeddings: m.embeddings.map((e) => e.vector),
      })),
    };
  }),

  byId: publicProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const settings = await getMuralSettings(ctx.db);
    const userId = ctx.session?.user.id;
    const mural = await ctx.db.mural.findFirst({
      where: { id: input.id, mergedIntoId: null, ...platformScope(ctx) },
    });
    if (!mural) return null;
    // Rejected murals are hidden, except a "not a mural" one from the people
    // who scanned it — it stays (greyed) in their collection. Fraud: never.
    if (mural.status === "REJECTED") {
      if (mural.rejectReason === "FRAUD" || !userId) return null;
      const scanned = await ctx.db.muralScan.count({
        where: { muralId: mural.id, userId },
      });
      if (!scanned) return null;
    }
    if (!userId) return { mural: toMuralCard(mural, settings), mine: null };

    const scans = await ctx.db.muralScan.findMany({
      where: { muralId: mural.id, userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        coinsAwarded: true,
        discoveryRank: true,
        keyframes: true,
        localDay: true,
      },
    });
    const day = localDay(timeZoneAt(mural.latitude, mural.longitude));
    return {
      mural: toMuralCard(mural, settings),
      mine: {
        scansToday: scans.filter((s) => s.localDay === day).length,
        dailyLimit: settings.dailyScansPerMural,
        totalScans: scans.length,
        coinsEarned: scans.reduce((a, s) => a + s.coinsAwarded, 0),
        rank: scans.find((s) => s.discoveryRank)?.discoveryRank ?? null,
        canName: !mural.title && scans.some((s) => s.discoveryRank),
        history: scans.map(({ id, createdAt, coinsAwarded, keyframes }) => ({
          id,
          createdAt,
          coinsAwarded,
          keyframes,
        })),
      },
    };
  }),

  startScan: protectedProcedure
    .input(z.object({ lat, lng, accuracy: z.number().min(0) }))
    .mutation(({ ctx, input }) => startScan(ctx.db, ctx.session.user.id, input)),

  submitScan: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        lat,
        lng,
        accuracy: z.number().min(0),
        mock: z.boolean().optional(),
        sweep: z.object({
          spanDeg: z.number().min(0).max(360),
          durationMs: z.number().int().min(0),
        }),
        platform: z.enum(["web", "ios", "android"]),
      }),
    )
    .mutation(({ ctx, input }) => submitScan(ctx.db, ctx.session.user.id, input)),

  name: protectedProcedure
    .input(
      z.object({
        muralId: z.string().min(1),
        title: z.string().trim().min(2).max(80),
        artist: z.string().trim().max(80).optional(),
      }),
    )
    .mutation(({ ctx, input }) => nameMural(ctx.db, ctx.session.user.id, input)),

  /** Collection › Murals: one card per mural the viewer has scanned. */
  mine: protectedProcedure
    .input(
      z.object({
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(48).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const settings = await getMuralSettings(ctx.db);
      const groups = await ctx.db.muralScan.groupBy({
        by: ["muralId"],
        // Not `NOT: { rejectReason: "FRAUD" }` — SQL NOT on a NULL reason is
        // NULL, which would drop every mural that was never rejected.
        where: {
          userId,
          mural: {
            mergedIntoId: null,
            ...platformScope(ctx),
            OR: [{ rejectReason: null }, { rejectReason: { not: "FRAUD" } }],
          },
        },
        _count: { _all: true },
        _sum: { coinsAwarded: true },
        _max: { createdAt: true },
        _min: { discoveryRank: true },
        orderBy: { _max: { createdAt: "desc" } },
      });
      const page = groups.slice(input.cursor, input.cursor + input.limit);
      const murals = await ctx.db.mural.findMany({
        where: { id: { in: page.map((g) => g.muralId) } },
      });
      const latest = await ctx.db.muralScan.findMany({
        where: { userId, muralId: { in: page.map((g) => g.muralId) } },
        orderBy: { createdAt: "desc" },
        distinct: ["muralId"],
        select: { muralId: true, keyframes: true },
      });
      const byId = new Map(murals.map((m) => [m.id, m]));
      const photo = new Map(latest.map((s) => [s.muralId, s.keyframes[1] ?? s.keyframes[0]]));
      const next = input.cursor + page.length;
      return {
        total: groups.length,
        nextCursor: next < groups.length ? next : null,
        items: page.flatMap((g) => {
          const m = byId.get(g.muralId);
          if (!m) return [];
          return [
            {
              ...toMuralCard(m, settings),
              /** The viewer's own photo — never someone else's. */
              myPhotoUrl: photo.get(m.id) ?? m.coverUrl,
              myScans: g._count._all,
              coinsEarned: g._sum.coinsAwarded ?? 0,
              rank: g._min.discoveryRank,
              lastScannedAt: g._max.createdAt,
            },
          ];
        }),
      };
    }),
});
