import { callerFor, mobileSession } from "~/server/mobile/context";
import { HttpError, errorResponse } from "~/server/mobile/http";
import { matchRoute } from "~/server/mobile/routes";

/**
 * ── /api/mobile/v1/* ───────────────────────────────────────────────────────
 *
 * The native app's API (wadzzoAR-mobile). One catch-all so the route table
 * in `server/mobile/routes.ts` is the single place endpoints are declared.
 * `v1` never breaks: shipped app builds can't be force-updated, so a breaking
 * change ships as `v2` beside it. Paths, methods, request bodies and the
 * `{ error: { code, message } }` shape are unchanged by the App Router move.
 */
export const dynamic = "force-dynamic";

async function readBody(req: Request): Promise<unknown> {
  if (req.method === "GET" || req.method === "DELETE") return undefined;
  const text = await req.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "BAD_REQUEST", "Invalid JSON body");
  }
}

async function handler(req: Request, ctx: RouteContext<"/api/mobile/v1/[...route]">) {
  try {
    const { route: segments } = await ctx.params;
    const path = "/" + segments.join("/");
    const match = matchRoute(req.method, path);
    if (match === "method-not-allowed") {
      throw new HttpError(405, "METHOD_NOT_SUPPORTED", `${req.method} not allowed on ${path}`);
    }
    if (!match) throw new HttpError(404, "NOT_FOUND", `No endpoint ${path}`);

    const { route, params } = match;
    const session = route.auth === "none" ? null : await mobileSession(req);
    if (route.auth === "required" && !session) {
      throw new HttpError(401, "UNAUTHORIZED", "Sign in to do that");
    }

    // First value wins for repeated keys, like the old Pages API parser.
    const query: Record<string, string | undefined> = {};
    new URL(req.url).searchParams.forEach((v, k) => {
      if (k !== "route" && !(k in query)) query[k] = v;
    });

    const data = await route.handler({
      req,
      params,
      query,
      body: await readBody(req),
      caller: await callerFor(session),
      session,
    });
    return Response.json(data ?? null, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE };
