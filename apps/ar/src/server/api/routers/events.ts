import { Prisma } from "@wadzzo/db";
import type { Db } from "@wadzzo/db";
import { z } from "zod";

import type {
  ArAnnouncement,
  ArComment,
  ArEventBrand,
  ArEventCard,
  ArEventDetail,
} from "~/lib/ar/types";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { platformScope, type PlatformContext } from "@wadzzo/platform/scope";

import { WADZZO_ICON } from "./pins";
import { AppError, ErrorCodes } from "@wadzzo/errors";

/**
 * ── Events & announcements ─────────────────────────────────────────────────
 *
 * The fan side of what brands publish from brand-wadzzo's Events page. Both
 * are public — signed-out viewers can browse everything — and there's no
 * moderation gate: a brand's post is live the moment it's saved. Auth only
 * guards what a viewer *does*: RSVP, comment, and the Following filter
 * (which needs to know who's asking).
 *
 * "Upcoming" means the event hasn't ended yet, so something already under way
 * stays in Upcoming until its end time. Announcements past `expiresAt` drop
 * out of every query, including by id — a shared link to one reads as gone.
 */

const creatorSelect = { id: true, name: true, profileUrl: true } as const;

const brandOf = (c: { id: string; name: string; profileUrl: string | null }): ArEventBrand => ({
  id: c.id,
  name: c.name,
  imageUrl: c.profileUrl ?? WADZZO_ICON,
});

const PAGE = {
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().nullish(),
};

const TARGET = z.object({
  kind: z.enum(["event", "announcement"]),
  id: z.string().min(1),
});

async function followedIds(db: Db, userId: string | undefined) {
  if (!userId) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED, { message: "Sign in to see brands you follow" });
  }
  const rows = await db.follow.findMany({
    where: { userId },
    select: { creatorId: true },
  });
  return rows.map((r) => r.creatorId);
}

const liveAnnouncement = (now: Date): Prisma.CreatorAnnouncementWhereInput => ({
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

function cardInclude(userId: string | undefined) {
  return {
    creator: { select: creatorSelect },
    _count: { select: { rsvps: true } },
    // Only the viewer's own RSVP, to answer "am I going?" without a second query.
    rsvps: { where: { userId: userId ?? "" }, select: { id: true }, take: 1 },
  } satisfies Prisma.CreatorEventInclude;
}

type CardRow = Prisma.CreatorEventGetPayload<{
  include: ReturnType<typeof cardInclude>;
}>;

function toCard(row: CardRow): ArEventCard {
  return {
    id: row.id,
    title: row.title,
    coverImage: row.coverImage,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    venueName: row.venueName,
    address: row.address,
    hasVenue: row.latitude != null && row.longitude != null,
    hasLink: !!row.link,
    brand: brandOf(row.creator),
    goingCount: row._count.rsvps,
    capacity: row.capacity,
    viewer: { going: row.rsvps.length > 0 },
  };
}

function toAnnouncement(
  row: Prisma.CreatorAnnouncementGetPayload<{
    include: {
      creator: { select: typeof creatorSelect };
      _count: { select: { comments: true } };
    };
  }>,
): ArAnnouncement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    images: row.images,
    pinned: row.pinned,
    ctaLabel: row.ctaLabel,
    ctaUrl: row.ctaUrl,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    brand: brandOf(row.creator),
    commentCount: row._count.comments,
  };
}

/** Throws NOT_FOUND unless the target exists, is still visible and is on this platform. */
async function assertTarget(db: Db, target: z.infer<typeof TARGET>, ctx: PlatformContext) {
  if (target.kind === "event") {
    const row = await db.creatorEvent.findFirst({
      where: { id: target.id, ...platformScope(ctx) },
      select: { creatorId: true },
    });
    if (!row) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Event not found" });
    return row;
  }
  const row = await db.creatorAnnouncement.findFirst({
    where: {
      id: target.id,
      ...liveAnnouncement(new Date()),
      ...platformScope(ctx),
    },
    select: { creatorId: true },
  });
  if (!row)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Announcement not found" });
  return row;
}

export const eventsRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        when: z.enum(["upcoming", "past"]).default("upcoming"),
        following: z.boolean().default(false),
        brandId: z.string().optional(),
        ...PAGE,
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session?.user.id;
      const now = new Date();
      const where: Prisma.CreatorEventWhereInput = {
        ...platformScope(ctx),
        endDate: input.when === "upcoming" ? { gte: now } : { lt: now },
        ...(input.brandId ? { creatorId: input.brandId } : {}),
      };
      if (input.following) {
        const ids = await followedIds(ctx.db, userId);
        where.AND = [{ creatorId: { in: ids } }];
      }

      // Upcoming reads soonest-first; past reads most-recent-first.
      const dir = input.when === "upcoming" ? "asc" : "desc";
      const rows = await ctx.db.creatorEvent.findMany({
        where,
        orderBy: [{ startDate: dir }, { id: dir }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: cardInclude(userId),
      });
      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        items: page.map(toCard),
        nextCursor: hasMore ? page[page.length - 1]!.id : null,
      };
    }),

  byId: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<ArEventDetail> => {
      const userId = ctx.session?.user.id;
      const row = await ctx.db.creatorEvent.findFirst({
        where: { id: input.id, ...platformScope(ctx) },
        include: {
          ...cardInclude(userId),
          _count: { select: { rsvps: true, comments: true } },
          // Linked drops go through the same gate the map uses, so an event
          // can't surface a pin that's pending review, rejected or hidden.
          pins: {
            where: { approved: true, hidden: false },
            select: {
              title: true,
              image: true,
              creator: { select: { profileUrl: true } },
              locations: {
                where: { hidden: false },
                select: { id: true },
                take: 1,
              },
            },
          },
          bounties: {
            where: { status: "APPROVED" },
            select: { id: true, title: true, imageUrls: true },
          },
        },
      });
      if (!row) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Event not found" });

      const card = toCard(row);
      return {
        ...card,
        description: row.description,
        latitude: row.latitude,
        longitude: row.longitude,
        link: row.link,
        linkLabel: row.linkLabel,
        pins: row.pins.flatMap((p) => {
          const loc = p.locations[0];
          return loc
            ? [
                {
                  id: loc.id,
                  title: p.title,
                  imageUrl: p.image ?? p.creator.profileUrl ?? WADZZO_ICON,
                },
              ]
            : [];
        }),
        bounties: row.bounties.map((b) => ({
          id: b.id,
          title: b.title,
          imageUrl: b.imageUrls[0] ?? null,
        })),
        commentCount: row._count.comments,
        isFull: row.capacity != null && card.goingCount >= row.capacity,
        isPast: row.endDate < new Date(),
      };
    }),

  rsvp: protectedProcedure
    .input(z.object({ id: z.string().min(1), going: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const event = await ctx.db.creatorEvent.findFirst({
        where: { id: input.id, ...platformScope(ctx) },
        select: { id: true, endDate: true, capacity: true },
      });
      if (!event) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Event not found" });

      if (!input.going) {
        await ctx.db.eventRsvp.deleteMany({
          where: { eventId: event.id, userId },
        });
      } else {
        if (event.endDate < new Date()) {
          throw new AppError(ErrorCodes.VALIDATION_FAILED, {
            message: "This event has already ended",
          });
        }
        try {
          // Serializable so two people can't both take the last seat: the
          // count and the insert commit together or not at all.
          await ctx.db.$transaction(
            async (tx) => {
              const mine = await tx.eventRsvp.findUnique({
                where: { eventId_userId: { eventId: event.id, userId } },
                select: { id: true },
              });
              if (mine) return;
              if (event.capacity != null) {
                const taken = await tx.eventRsvp.count({
                  where: { eventId: event.id },
                });
                if (taken >= event.capacity) {
                  throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
                    message: "This event is full",
                  });
                }
              }
              await tx.eventRsvp.create({
                data: { eventId: event.id, userId },
              });
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError) {
            // P2002: a double tap already inserted it. P2034: lost a
            // serialization race — safe for the viewer to just try again.
            if (e.code === "P2034") {
              throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
                message: "Lots of people RSVPing — try again",
              });
            }
            if (e.code !== "P2002") throw e;
          } else {
            throw e;
          }
        }
      }

      const goingCount = await ctx.db.eventRsvp.count({
        where: { eventId: event.id },
      });
      return { going: input.going, goingCount };
    }),

  announcements: publicProcedure
    .input(
      z.object({
        following: z.boolean().default(false),
        brandId: z.string().optional(),
        ...PAGE,
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.CreatorAnnouncementWhereInput = {
        AND: [
          liveAnnouncement(new Date()),
          platformScope(ctx),
          ...(input.brandId ? [{ creatorId: input.brandId }] : []),
          ...(input.following
            ? [
                {
                  creatorId: {
                    in: await followedIds(ctx.db, ctx.session?.user.id),
                  },
                },
              ]
            : []),
        ],
      };
      // "Pin to top" is a brand putting one post first on *its own* list. In
      // the all-brands feed it would let every brand claim the top slot, so
      // there it's just a badge and the feed stays newest-first.
      const orderBy: Prisma.CreatorAnnouncementOrderByWithRelationInput[] = input.brandId
        ? [{ pinned: "desc" }, { createdAt: "desc" }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }];
      const rows = await ctx.db.creatorAnnouncement.findMany({
        where,
        orderBy,
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          creator: { select: creatorSelect },
          _count: { select: { comments: true } },
        },
      });
      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        items: page.map(toAnnouncement),
        nextCursor: hasMore ? page[page.length - 1]!.id : null,
      };
    }),

  announcement: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<ArAnnouncement> => {
      const row = await ctx.db.creatorAnnouncement.findFirst({
        where: {
          id: input.id,
          ...liveAnnouncement(new Date()),
          ...platformScope(ctx),
        },
        include: {
          creator: { select: creatorSelect },
          _count: { select: { comments: true } },
        },
      });
      if (!row)
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Announcement not found" });
      return toAnnouncement(row);
    }),

  // ── Comments (shared by both kinds) ──────────────────────────────────────

  comments: publicProcedure.input(TARGET).query(async ({ ctx, input }): Promise<ArComment[]> => {
    const userId = ctx.session?.user.id;
    const author = { select: { id: true, name: true, image: true } };
    // Another platform's comments aren't readable here (visibility rules unchanged otherwise).
    if (!ctx.platform.isRoot) {
      const where = { id: input.id, ...platformScope(ctx) };
      const found =
        input.kind === "event"
          ? await ctx.db.creatorEvent.count({ where })
          : await ctx.db.creatorAnnouncement.count({ where });
      if (!found) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND);
    }
    const rows =
      input.kind === "event"
        ? await ctx.db.eventComment.findMany({
            where: { eventId: input.id },
            orderBy: { createdAt: "desc" },
            take: 100,
            include: { user: author },
          })
        : await ctx.db.announcementComment.findMany({
            where: { announcementId: input.id },
            orderBy: { createdAt: "desc" },
            take: 100,
            include: { user: author },
          });
    return rows.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      author: c.user,
      mine: c.userId === userId,
    }));
  }),

  addComment: protectedProcedure
    .input(z.object({ target: TARGET, content: z.string().trim().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await assertTarget(ctx.db, input.target, ctx);
      const data = { userId, content: input.content };
      const row =
        input.target.kind === "event"
          ? await ctx.db.eventComment.create({
              data: { ...data, eventId: input.target.id },
            })
          : await ctx.db.announcementComment.create({
              data: { ...data, announcementId: input.target.id },
            });
      return { id: row.id };
    }),

  /** The comment's author, or the brand that owns the event/announcement. */
  deleteComment: protectedProcedure
    .input(z.object({ kind: TARGET.shape.kind, commentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const row =
        input.kind === "event"
          ? await ctx.db.eventComment.findUnique({
              where: { id: input.commentId },
              select: { userId: true, event: { select: { creatorId: true } } },
            })
          : await ctx.db.announcementComment.findUnique({
              where: { id: input.commentId },
              select: {
                userId: true,
                announcement: { select: { creatorId: true } },
              },
            });
      if (!row) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Comment not found" });
      const ownerId = "event" in row ? row.event.creatorId : row.announcement.creatorId;
      if (row.userId !== userId && ownerId !== userId) {
        throw new AppError(ErrorCodes.AUTH_FORBIDDEN, { message: "You can't delete this comment" });
      }
      if (input.kind === "event") {
        await ctx.db.eventComment.delete({ where: { id: input.commentId } });
      } else {
        await ctx.db.announcementComment.delete({
          where: { id: input.commentId },
        });
      }
      return { deleted: true };
    }),
});
