// src/agent/tools/trails.ts — map trails (docs/trails/ai.md): the brand's ordered sets of pins.
//
// The agent can list trails, report how fans do on one, and propose a new draft trail or
// changes. It never submits a trail for review, sets a reward or decides who can collect:
// the brand does that in Trail mode.

import { z } from "zod";
import { db } from "../../lib/db";
import type { NamedRef, ReportBar, ReportStat, TrailChanges } from "@wadzzo/agent-contract";
import { nearestOrder } from "@wadzzo/geo/trail-geometry";
import { MAX_TRAIL_STOPS, MIN_TRAIL_STOPS } from "@wadzzo/schemas/trail";
import type { Run } from "../run";
import { defineTool, isoDay, parseDate, plural } from "./define";

type Stop = NamedRef & { lat: number; lng: number };

/** The brand's trail by id (never another brand's). */
async function ownTrail(run: Run, id: string) {
  const t = await db.trail.findFirst({
    where: { id, creatorId: run.brand.creatorId, hidden: false },
    select: { id: true, title: true, status: true },
  });
  if (!t) throw new Error("That isn't one of this brand's trails. Use list_trails to get its id.");
  return t;
}

/** Stops from pin ids (or a find_pins ref): the brand's own live regular pins, in that order. */
async function stopsFrom(
  run: Run,
  a: { pinIds?: string[]; ref?: string; sortByDistance?: boolean },
): Promise<Stop[]> {
  const ids = a.ref ? run.result(a.ref, "pins").items.map((p) => p.id) : (a.pinIds ?? []);
  if (ids.length < MIN_TRAIL_STOPS)
    throw new Error(
      `A trail needs at least ${MIN_TRAIL_STOPS} pins: pass pinIds or a find_pins ref.`,
    );
  if (ids.length > MAX_TRAIL_STOPS)
    throw new Error(`A trail has at most ${MAX_TRAIL_STOPS} stops; pick fewer pins.`);
  const rows = await db.locationGroup.findMany({
    where: {
      id: { in: ids },
      creatorId: run.brand.creatorId,
      hidden: false,
      hotspotId: null,
      rewardForTrail: null,
      endDate: { gte: new Date() },
    },
    select: { id: true, title: true, latitude: true, longitude: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const stops = ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [{ id: r.id, title: r.title, lat: r.latitude, lng: r.longitude }] : [];
  });
  if (stops.length < MIN_TRAIL_STOPS)
    throw new Error(
      "Fewer than two of those can be stops (only the brand's own live pins, not hotspot drops).",
    );
  if (!a.sortByDistance) return stops;
  return nearestOrder(stops).map((i) => stops[i]!);
}

export const trailTools = [
  defineTool({
    name: "list_trails",
    description:
      "List the brand's OWN map trails (ordered sets of its pins fans follow): id, status (DRAFT, PENDING = in review, LIVE, ENDED), stops and how many fans started.",
    schema: z.object({ text: z.string().optional() }),
    label: () => "Checking your trails…",
    run: async (a, run) => {
      const rows = await db.trail.findMany({
        where: {
          creatorId: run.brand.creatorId,
          hidden: false,
          ...(a.text && { title: { contains: a.text, mode: "insensitive" } }),
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          status: true,
          order: true,
          distanceMetres: true,
          stops: {
            orderBy: { position: "asc" },
            select: { locationGroup: { select: { id: true, title: true } } },
          },
          _count: { select: { runs: true } },
        },
      });
      return {
        model: {
          trails: rows.map(
            (t) =>
              `${t.id} | ${t.title} | ${t.status} | ${t.order === "ORDERED" ? "in order" : "any order"} | ${Math.round(t.distanceMetres)} m | ${t._count.runs} started | stops: ${t.stops
                .map((s) => `${s.locationGroup.title} (${s.locationGroup.id})`)
                .join(" → ")}`,
          ),
        },
        detail: `Found ${plural(rows.length, "trail")}`,
      };
    },
  }),

  defineTool({
    name: "trail_report",
    description:
      "How fans do on one of the brand's trails: started, finished, rewards claimed, and how many runners collected each stop (where people drop off). Returns a ref to show as a report card.",
    schema: z.object({ trailId: z.string() }),
    label: () => "Looking at how fans follow the trail…",
    run: async (a, run) => {
      const t = await ownTrail(run, a.trailId);
      const full = await db.trail.findUniqueOrThrow({
        where: { id: t.id },
        select: {
          rewardGroup: { select: { limit: true, remaining: true } },
          stops: {
            orderBy: { position: "asc" },
            select: { position: true, locationGroup: { select: { id: true, title: true } } },
          },
        },
      });
      const [started, finished, perStop] = await Promise.all([
        db.trailRun.count({ where: { trailId: t.id } }),
        db.trailRun.count({ where: { trailId: t.id, completedAt: { not: null } } }),
        Promise.all(
          full.stops.map(async (s) => {
            const rows = await db.locationConsumer.findMany({
              where: {
                location: { locationGroupId: s.locationGroup.id },
                user: { trailRuns: { some: { trailId: t.id } } },
              },
              select: { userId: true },
              distinct: ["userId"],
            });
            return { label: `${s.position}. ${s.locationGroup.title}`, value: rows.length };
          }),
        ),
      ]);
      const claimed = full.rewardGroup ? full.rewardGroup.limit - full.rewardGroup.remaining : null;
      const stats: ReportStat[] = [
        { label: "Started", value: started.toLocaleString("en-US") },
        {
          label: "Finished",
          value: finished.toLocaleString("en-US"),
          hint: started ? `${Math.round((finished / started) * 100)}% of starters` : undefined,
        },
        ...(claimed !== null
          ? [{ label: "Rewards claimed", value: claimed.toLocaleString("en-US") }]
          : []),
      ];
      const bars: ReportBar[] = perStop;
      const ref = run.addResult({
        kind: "report",
        title: `Trail · ${t.title}`,
        stats,
        bars: bars.length ? { title: "Runners who collected each stop", items: bars } : undefined,
        note: started === 0 ? "No fan has started this trail yet." : undefined,
      });
      return {
        model: { ref, trail: t.title, status: t.status, started, finished, claimed, stops: bars },
        detail: `${plural(started, "fan")} started, ${finished} finished`,
      };
    },
  }),

  defineTool({
    name: "propose_trail",
    description:
      "Prepare a new map trail from the brand's own pins (ids from find_pins, or its ref), for the person to confirm. " +
      "It is saved as a DRAFT with straight lines; the person snaps it to streets and sends it for review in Trail mode. " +
      "Pass the pins in the order fans should walk them, or sortByDistance to get a short walking order. Hotspot drops can't be stops.",
    schema: z.object({
      title: z.string().min(3).max(80),
      description: z.string().max(600).optional(),
      pinIds: z.array(z.string()).max(MAX_TRAIL_STOPS).optional(),
      ref: z.string().optional().describe("A find_pins ref instead of pinIds"),
      sortByDistance: z.boolean().default(false),
      mode: z.enum(["WALK", "BIKE", "DRIVE"]).default("WALK"),
      order: z.enum(["ORDERED", "ANY"]).default("ORDERED"),
      startDate: z.string().optional().describe("YYYY-MM-DD, default today"),
      endDate: z.string().optional().describe("YYYY-MM-DD, default 30 days after the start"),
    }),
    label: () => "Drafting the trail…",
    run: async (a, run) => {
      const stops = await stopsFrom(run, a);
      const start = a.startDate ? parseDate(a.startDate, "startDate") : new Date();
      const end = a.endDate
        ? parseDate(a.endDate, "endDate")
        : new Date(start.getTime() + 30 * 86_400_000);
      if (end <= start) throw new Error("The trail must end after it starts.");
      const summary = `Draft trail “${a.title}” with ${plural(stops.length, "stop")}`;
      run.propose(
        {
          type: "create_trail",
          trail: {
            title: a.title,
            description: a.description ?? null,
            mode: a.mode,
            order: a.order,
            stops,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
          },
        },
        summary,
      );
      return {
        model: {
          proposed: true,
          summary,
          stops: stops.map((s) => s.title),
          dates: `${isoDay(start)} → ${isoDay(end)}`,
          note: "The person sees a confirmation card. Say it's ready to confirm, then that they can check it on the map (Trails), snap it to streets and send it for review. Don't claim it's done.",
        },
        detail: "Ready for your review",
      };
    },
  }),

  defineTool({
    name: "propose_trail_changes",
    description:
      "Prepare changes to one of the brand's trails (trailId from list_trails): title, description, order, mode, or a new list of stops (pin ids in order). The person confirms on a card.",
    schema: z.object({
      trailId: z.string(),
      title: z.string().min(3).max(80).optional(),
      description: z.string().max(600).optional(),
      order: z.enum(["ORDERED", "ANY"]).optional(),
      mode: z.enum(["WALK", "BIKE", "DRIVE"]).optional(),
      pinIds: z
        .array(z.string())
        .max(MAX_TRAIL_STOPS)
        .optional()
        .describe("The full new stop list, in order"),
      sortByDistance: z.boolean().default(false),
    }),
    label: () => "Preparing the trail change for your review…",
    run: async (a, run) => {
      const trail = await ownTrail(run, a.trailId);
      if (trail.status === "ENDED") throw new Error("That trail has ended and can't change.");
      const changes: TrailChanges = {};
      if (a.title) changes.title = a.title;
      if (a.description !== undefined) changes.description = a.description;
      if (a.order) changes.order = a.order;
      if (a.mode) changes.mode = a.mode;
      if (a.pinIds)
        changes.stops = await stopsFrom(run, {
          pinIds: a.pinIds,
          sortByDistance: a.sortByDistance,
        });
      if (!Object.keys(changes).length) throw new Error("No changes given.");
      const summary = `Change ${Object.keys(changes).join(", ")} on trail “${trail.title}”`;
      run.propose(
        { type: "update_trail", trail: { id: trail.id, title: trail.title }, changes },
        summary,
      );
      return {
        model: {
          proposed: true,
          summary,
          note: "The person sees a confirmation card and decides. Don't claim it's done.",
        },
        detail: "Ready for your review",
      };
    },
  }),
];
