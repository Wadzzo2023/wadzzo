import { NextResponse } from "next/server";

import { frameAncestors } from "~/lib/embed/config";
import { db } from "@wadzzo/db/server";

/** The CSP `frame-ancestors` value for one saved embed (used by `src/proxy.ts`). */
export async function GET(_req: Request, ctx: RouteContext<"/api/embed/frame-policy/[id]">) {
  const { id } = await ctx.params;
  const row = id
    ? await db.mapEmbed.findUnique({
        where: { id },
        select: { enabled: true, allowedDomains: true },
      })
    : null;
  // A turned-off or unknown embed shows "Map unavailable", which may sit in any frame.
  const policy = row?.enabled ? frameAncestors(row.allowedDomains) : "frame-ancestors *";
  return NextResponse.json(
    { policy, live: Boolean(row?.enabled) },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
      },
    },
  );
}
