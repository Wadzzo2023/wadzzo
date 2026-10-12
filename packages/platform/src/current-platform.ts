import { db, type Platform } from "@wadzzo/db";
import { AppError } from "@wadzzo/errors";

import { logAudit } from "./audit";

const DEFAULT_PLATFORM_SLUG = "wadzzo";
const CACHE_TTL_MS = 60_000;

/** The platform this deployment serves (`PLATFORM_SLUG`, default "wadzzo"). */
export const getPlatformSlug = (): string => process.env.PLATFORM_SLUG ?? DEFAULT_PLATFORM_SLUG;

let cached: { platform: Platform; at: number } | undefined;

/** The Platform row this deployment serves. Cached per process for a minute. */
export async function getCurrentPlatform(): Promise<Platform> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.platform;
  const slug = getPlatformSlug();
  const platform = await db.platform.findUnique({ where: { id: slug } });
  if (!platform) {
    throw new AppError("PLATFORM_NOT_FOUND", {
      message: `Platform "${slug}" is missing from the Platform table (see packages/db/prisma/sql/2026-10-07-multi-platform.sql)`,
      details: { slug },
    });
  }
  cached = { platform, at: Date.now() };
  return platform;
}

/**
 * Record that `userId` used this platform: first visit creates the UserPlatform
 * row (and an audit entry: "user.signup" for brand-new users, else
 * "user.join_platform"); later visits bump lastSeenAt.
 */
export async function recordUserPlatform(
  platform: Platform,
  userId: string,
  { signUpMethod, isNewUser }: { signUpMethod?: string; isNewUser: boolean },
) {
  // skipDuplicates keeps concurrent first logins safe; count tells us whether this was the first.
  const { count } = await db.userPlatform.createMany({
    data: [{ userId, platformId: platform.id, signUpMethod }],
    skipDuplicates: true,
  });
  if (count === 0) {
    await db.userPlatform.update({
      where: { userId_platformId: { userId, platformId: platform.id } },
      data: { lastSeenAt: new Date() },
    });
    return;
  }
  await logAudit(
    { db, platform },
    {
      action: isNewUser ? "user.signup" : "user.join_platform",
      entityType: "User",
      entityId: userId,
      actorId: userId,
      meta: signUpMethod ? { signUpMethod } : undefined,
    },
  );
}
