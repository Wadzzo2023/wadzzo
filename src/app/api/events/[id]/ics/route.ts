import { eventIcs } from "~/lib/ar/events";
import { db } from "~/server/db";
import { getCurrentPlatform, platformScope } from "~/server/platform";

/**
 * GET /api/events/:id/ics — the event as an iCalendar file, for "Add to
 * calendar" on web and in the mobile app. Public, like the event itself.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/events/[id]/ics">) {
  const { id } = await ctx.params;
  const platform = await getCurrentPlatform();
  const row = id
    ? await db.creatorEvent.findFirst({
        where: { id, ...platformScope({ platform }) },
        include: { creator: { select: { name: true } } },
      })
    : null;
  if (!row) return new Response("Event not found", { status: 404 });

  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const pageUrl = `${proto}://${host}/events/${row.id}`;
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
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}.ics"`,
      "Cache-Control": "public, max-age=60",
    },
  });
}
