import type { NextApiRequest, NextApiResponse } from "next";

import { callerFor, mobileSession } from "~/server/mobile/context";
import { HttpError, sendError } from "~/server/mobile/http";
import { matchRoute } from "~/server/mobile/routes";

/**
 * ── /api/mobile/v1/* ───────────────────────────────────────────────────────
 *
 * The native app's API (wadzzoAR-mobile). One catch-all so the route table
 * in `server/mobile/routes.ts` is the single place endpoints are declared.
 * `v1` never breaks: shipped app builds can't be force-updated, so a breaking
 * change ships as `v2` beside it.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const segments = req.query.route;
    const path = "/" + (Array.isArray(segments) ? segments.join("/") : (segments ?? ""));
    const match = matchRoute(req.method ?? "GET", path);
    if (match === "method-not-allowed") {
      throw new HttpError(405, "METHOD_NOT_SUPPORTED", `${req.method} not allowed on ${path}`);
    }
    if (!match) throw new HttpError(404, "NOT_FOUND", `No endpoint ${path}`);

    const { route, params } = match;
    const session = route.auth === "none" ? null : await mobileSession(req);
    if (route.auth === "required" && !session) {
      throw new HttpError(401, "UNAUTHORIZED", "Sign in to do that");
    }

    const query: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.query)) {
      if (k !== "route") query[k] = Array.isArray(v) ? v[0] : v;
    }

    const data = await route.handler({
      req,
      params,
      query,
      body: req.body,
      caller: await callerFor(session),
      session,
    });
    res.status(200).json(data ?? null);
  } catch (e) {
    sendError(res, e);
  }
}
