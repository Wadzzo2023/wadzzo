import type { NextApiRequest } from "next";
import type { Session } from "next-auth";

import { appRouter } from "~/server/api/root";
import { createInnerTRPCContext } from "~/server/api/trpc";
import { db } from "~/server/db";
import { getCurrentPlatform } from "~/server/platform";

import { verifyMobileToken } from "./token";

/**
 * Builds the same `{ session, db }` context tRPC procedures run with on the
 * web, from a mobile Bearer token instead of the NextAuth cookie — so every
 * `/api/mobile/v1` handler can call the existing procedures unchanged.
 *
 * The token itself never expires (see token.ts); the user-row lookup here is
 * the one remaining gate, and it's what makes account deletion cut access.
 */
export async function mobileSession(req: NextApiRequest): Promise<Session | null> {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) return null;

  const claims = verifyMobileToken(match[1]);
  if (!claims) return null;

  const user = await db.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, name: true, email: true, image: true },
  });
  if (!user) return null;

  return {
    user: {
      id: user.id,
      name: user.name,
      image: user.image,
      email: user.email ?? claims.email ?? null,
      walletType: claims.walletType,
      emailVerified: claims.emailVerified,
    },
    // Not an expiry the app obeys — NextAuth's Session type just requires it.
    expires: "9999-12-31T23:59:59.000Z",
  };
}

export async function callerFor(session: Session | null) {
  return appRouter.createCaller(createInnerTRPCContext({ session, platform: await getCurrentPlatform() }));
}

export type Caller = Awaited<ReturnType<typeof callerFor>>;
