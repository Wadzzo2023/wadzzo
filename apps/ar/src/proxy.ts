import { NextResponse, type NextRequest } from "next/server";

import { brandOrigins } from "~/lib/embed/config";

/**
 * Sets the iframe allowlist (CSP `frame-ancestors`) on `/embed/[id]` before the
 * page renders: each brand lists the sites that may frame its map, and the
 * editor's `/embed/preview` may only be framed by brand-wadzzo.
 */
export async function proxy(request: NextRequest) {
  const id = request.nextUrl.pathname.split("/")[2] ?? "";
  const res = NextResponse.next();

  if (id === "preview") {
    // Otherwise it would be a way to put the map on any site with no allowlist at all.
    res.headers.set("Content-Security-Policy", `frame-ancestors 'self' ${brandOrigins().join(" ")}`);
    return res;
  }

  try {
    const r = await fetch(new URL(`/api/embed/frame-policy/${encodeURIComponent(id)}`, request.url), { next: { revalidate: 30 } });
    const { policy, live } = (await r.json()) as { policy: string; live: boolean };
    res.headers.set("Content-Security-Policy", policy);
    if (live) res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
  } catch {
    // If the policy can't be read, fail closed: only our own pages may frame it.
    res.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
  }
  return res;
}

export const config = { matcher: "/embed/:id" };
