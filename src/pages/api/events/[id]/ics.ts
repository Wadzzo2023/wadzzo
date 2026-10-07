import type { NextApiRequest, NextApiResponse } from "next";

import { eventIcs } from "~/lib/ar/events";
import { db } from "~/server/db";
import { getCurrentPlatform, platformScope } from "~/server/platform";

/**
 * GET /api/events/:id/ics — the event as an iCalendar file, for "Add to
 * calendar" on web and in the mobile app. Public, like the event itself.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }
  const id = typeof req.query.id === "string" ? req.query.id : "";
  const platform = await getCurrentPlatform();
  const row = id
    ? await db.creatorEvent.findFirst({
        where: { id, ...platformScope({ platform }) },
        include: { creator: { select: { name: true } } },
      })
    : null;
  if (!row) return res.status(404).send("Event not found");

  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? "http";
  const pageUrl = `${proto}://${req.headers.host}/events/${row.id}`;
  const ics = eventIcs(
    {
      id: row.id,
      title: row.title,
      description: row.description,
      link: row.link,
      venueName: row.venueName,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      startDate: row.startDate.toISOString(),
      endDate: row.endDate.toISOString(),
      brand: { name: row.creator.name },
    },
    pageUrl,
  );
  const filename = (row.title.replace(/[^\w\- ]+/g, "").trim() || "event").slice(0, 60);
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="${filename}.ics"`);
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(200).send(ics);
}
