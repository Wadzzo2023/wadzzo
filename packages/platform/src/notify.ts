import type { Db, NotificationType, Prisma } from "@wadzzo/db";

interface NotifyArgs {
  actorId: string;
  type: NotificationType;
  entityId: number;
  /** Everyone who should be told (the actor is always skipped). */
  recipients: string[];
  /** Recipients listed here are notified in their brand inbox, the rest in their fan inbox. */
  creatorIds?: string[];
  /** What the entity can't carry itself: an item's name, an amount, a quantity… */
  meta?: Prisma.InputJsonObject;
}

/**
 * One notification event (`actor` did `type` on `entityId`) delivered to each
 * recipient except the actor.
 *
 * Never throws: a notification is never worth failing the action that caused it.
 */
export async function notify(
  db: Db,
  { actorId, type, entityId, recipients, creatorIds = [], meta }: NotifyArgs,
) {
  const to = [...new Set(recipients)].filter((id) => id && id !== actorId);
  if (!to.length) return;
  try {
    await db.notificationObject.create({
      data: {
        actorId,
        entityType: type,
        entityId,
        isUser: false,
        meta,
        Notification: {
          create: to.map((notifierId) => ({
            notifierId,
            isCreator: creatorIds.includes(notifierId),
          })),
        },
      },
    });
  } catch (error) {
    console.error("[notify] failed", type, entityId, error);
  }
}

type SingleRecipientArgs = Pick<NotifyArgs, "actorId" | "type" | "entityId" | "meta">;

/** Notify one brand (in its brand inbox). */
export const notifyBrand = (db: Db, args: SingleRecipientArgs & { creatorId: string }) =>
  notify(db, {
    actorId: args.actorId,
    type: args.type,
    entityId: args.entityId,
    recipients: [args.creatorId],
    creatorIds: [args.creatorId],
    meta: args.meta,
  });

/** Notify one fan (in their fan inbox). */
export const notifyFan = (db: Db, args: SingleRecipientArgs & { userId: string }) =>
  notify(db, {
    actorId: args.actorId,
    type: args.type,
    entityId: args.entityId,
    recipients: [args.userId],
    meta: args.meta,
  });
