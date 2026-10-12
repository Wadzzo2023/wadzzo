import type { GetServerSidePropsContext } from "next";
import type { Session } from "next-auth";

import { getServerAuthSession } from "@wadzzo/auth";
import type { Db, Platform } from "@wadzzo/db";
import { db } from "@wadzzo/db/server";
import { getCurrentPlatform } from "@wadzzo/platform/server";

/** What every procedure can rely on. */
export interface TrpcContext {
  session: Session | null;
  /** The white-label platform this deployment serves. */
  platform: Platform;
  db: Db;
}

/** A context from a session and platform already in hand (tests, server-side callers). */
export const createInnerTrpcContext = (
  options: Pick<TrpcContext, "session" | "platform">,
): TrpcContext => ({
  session: options.session,
  platform: options.platform,
  db,
});

/**
 * The context of a request. Pages-router API routes pass their `{ req, res }`;
 * App Router handlers pass nothing (the session comes from the request cookies).
 */
export async function createTrpcContext(request?: {
  req: GetServerSidePropsContext["req"];
  res: GetServerSidePropsContext["res"];
}): Promise<TrpcContext> {
  const [session, platform] = await Promise.all([
    getServerAuthSession(request),
    getCurrentPlatform(),
  ]);
  return createInnerTrpcContext({ session, platform });
}
