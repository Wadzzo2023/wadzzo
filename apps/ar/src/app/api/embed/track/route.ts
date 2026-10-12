import type { EmbedEvent } from "~/lib/embed/config";
import { db } from "@wadzzo/db";
import { HttpError, clientIp, rateLimit } from "~/server/mobile/http";

/**
 * POST /api/embed/track `{ id, e }` — one counter bump for a website embed.
 *
 * Sent with `navigator.sendBeacon`, which posts as text/plain, so the body is
 * parsed by hand. Counts are per embed per UTC day (`MapEmbedDailyStat`),
 * incremented with an upsert so the first event of a day creates the row.
 * Always answers 204: a counter failing must never surface on someone's site.
 */
export const dynamic = "force-dynamic";

const COLUMN: Record<EmbedEvent, "views" | "pinTaps" | "openClicks" | "eventsClicks" | "bountiesClicks"> = {
  view: "views",
  pinTap: "pinTaps",
  open: "openClicks",
  events: "eventsClicks",
  bounties: "bountiesClicks",
};

const noContent = () => new Response(null, { status: 204 });

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const body: unknown = raw ? JSON.parse(raw) : undefined;
    const { id, e } = (body ?? {}) as { id?: unknown; e?: unknown };
    if (typeof id !== "string" || id === "preview" || typeof e !== "string" || !(e in COLUMN)) return noContent();
    // Generous for real use (a visitor tapping around), tight enough that a
    // loop can't inflate a brand's numbers much.
    rateLimit(`embed:${clientIp(req)}:${id}`, 60, 60_000);

    const exists = await db.mapEmbed.count({ where: { id } });
    if (!exists) return noContent();

    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const col = COLUMN[e as EmbedEvent];
    await db.mapEmbedDailyStat.upsert({
      where: { embedId_day: { embedId: id, day } },
      create: { embedId: id, day, [col]: 1 },
      update: { [col]: { increment: 1 } },
    });
  } catch (err) {
    if (!(err instanceof HttpError)) console.error("[embed/track]", err);
  }
  return noContent();
}
