import { z } from "zod";

import { pinTemplateDataSchema, readTemplateData, type PinTemplateData } from "./pin-template";

/**
 * Map trails (docs/trails): what a brand may save, the limits, and how a fan's progress is
 * worked out. Shared by the brand portal, the fan apps, the API and the agent, so every side
 * applies the same rules.
 */

export const TRAIL_MODES = ["WALK", "HIKE", "BIKE", "DRIVE"] as const;
export type TrailMode = (typeof TRAIL_MODES)[number];

export const TRAIL_ORDERS = ["ORDERED", "ANY"] as const;
export type TrailOrder = (typeof TRAIL_ORDERS)[number];

export const TRAIL_STATUSES = ["DRAFT", "PENDING", "LIVE", "ENDED"] as const;
export type TrailStatus = (typeof TRAIL_STATUSES)[number];

/** A trail has at least two stops and at most this many. */
export const MIN_TRAIL_STOPS = 2;
export const MAX_TRAIL_STOPS = 25;
/** Points in one section of a path (a routed street path between two stops). */
export const MAX_SECTION_POINTS = 2_000;
/** Trails one brand may keep (drafts included). */
export const MAX_TRAILS_PER_BRAND = 200;

export const TRAIL_MODE_LABEL: Record<TrailMode, string> = {
  WALK: "Walk",
  HIKE: "Hike",
  BIKE: "Bike",
  DRIVE: "Drive",
};

export const TRAIL_STATUS_LABEL: Record<TrailStatus, string> = {
  DRAFT: "Draft",
  PENDING: "In review",
  LIVE: "Live",
  ENDED: "Ended",
};

/** Trail colours a brand picks from (hex, so Mapbox, React Native and CSS all read them). */
export const TRAIL_COLORS = [
  "#16a34a",
  "#2563eb",
  "#9333ea",
  "#db2777",
  "#ea580c",
  "#ca8a04",
  "#0d9488",
  "#111827",
] as const;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour");

const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

/** One section of the path: [lng, lat] points from one stop to the next. */
export const trailSectionSchema = z.array(lngLat).min(2).max(MAX_SECTION_POINTS);

export const trailStopInputSchema = z.object({
  /** The pin (LocationGroup) this stop is. */
  pinId: z.string().min(1),
  required: z.boolean().default(true),
  clue: z.string().trim().max(280).optional().nullable(),
});
export type TrailStopInput = z.infer<typeof trailStopInputSchema>;

/**
 * What the New stop form starts from: a pin template's fields, without the parts that differ
 * per stop (title, location).
 */
export const stopDefaultsSchema = pinTemplateDataSchema.omit({ title: true, location: true });
export type StopDefaults = z.infer<typeof stopDefaultsSchema>;

/** Saved stop defaults, read leniently: a field that no longer checks out is dropped. */
export function readStopDefaults(raw: unknown): StopDefaults {
  const { title: _t, location: _l, ...rest } = readTemplateData("PIN", raw);
  return rest satisfies PinTemplateData;
}

export const trailRewardSchema = z.object({
  /** The brand's asset fans get for finishing. */
  assetId: z.number().int().positive(),
  /** How many fans can claim it. */
  limit: z.number().int().min(1).max(100_000),
  /** Required stops to collect; null = all of them. */
  minStops: z.number().int().min(1).max(MAX_TRAIL_STOPS).nullable().default(null),
});
export type TrailRewardInput = z.infer<typeof trailRewardSchema>;

export const trailDetailsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the trail a name")
    .max(80, "Keep the name under 80 characters"),
  description: z.string().trim().max(2000).optional().nullable(),
  coverImage: z.url().optional().nullable(),
  mode: z.enum(TRAIL_MODES).default("WALK"),
  order: z.enum(TRAIL_ORDERS).default("ORDERED"),
  color: hexColor.optional().nullable(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

/**
 * One save of the whole trail: details, stops in order, the path (one section per pair of
 * stops) and the stop defaults. The builder keeps everything locally and sends it at once.
 */
export const saveTrailSchema = trailDetailsSchema
  .extend({
    /** Absent: a new trail. */
    id: z.string().optional(),
    /** The brand (admins build for any brand). */
    creatorId: z.string().optional(),
    /** What the client last loaded; a newer save by someone else is refused. */
    updatedAt: z.coerce.date().optional(),
    stops: z.array(trailStopInputSchema).max(MAX_TRAIL_STOPS, `At most ${MAX_TRAIL_STOPS} stops`),
    path: z.array(trailSectionSchema),
    stopDefaults: stopDefaultsSchema.optional().nullable(),
    reward: trailRewardSchema.optional().nullable(),
  })
  .superRefine((t, ctx) => {
    if (t.endDate <= t.startDate)
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The end must be after the start",
      });
    const ids = new Set<string>();
    t.stops.forEach((s, i) => {
      if (ids.has(s.pinId))
        ctx.addIssue({
          code: "custom",
          path: ["stops", i],
          message: "A pin can be a stop only once",
        });
      ids.add(s.pinId);
    });
    // A path, when there is one, has a section between every pair of stops.
    if (t.path.length && t.path.length !== Math.max(0, t.stops.length - 1))
      ctx.addIssue({ code: "custom", path: ["path"], message: "The path doesn't match the stops" });
    const required = t.stops.filter((s) => s.required).length;
    if (t.reward?.minStops != null && t.reward.minStops > required)
      ctx.addIssue({
        code: "custom",
        path: ["reward", "minStops"],
        message: `There are only ${required} required stops`,
      });
  });
export type SaveTrailInput = z.infer<typeof saveTrailSchema>;

/** What must be true before a trail goes to review (drafts may be incomplete). */
export function submitProblems(t: {
  stops: { required: boolean }[];
  path: unknown[];
  endDate: Date;
}): string[] {
  const problems: string[] = [];
  if (t.stops.length < MIN_TRAIL_STOPS) problems.push(`Add at least ${MIN_TRAIL_STOPS} stops`);
  if (!t.stops.some((s) => s.required)) problems.push("Make at least one stop required");
  if (t.path.length !== Math.max(0, t.stops.length - 1))
    problems.push("Draw the path between every stop");
  if (t.endDate.getTime() < Date.now()) problems.push("The end date has passed");
  return problems;
}

// ── Progress ────────────────────────────────────────────────────────────

export type ProgressStop = {
  position: number;
  required: boolean;
  /** The fan has collected this stop's pin. */
  done: boolean;
};

export type TrailProgress = {
  done: number;
  total: number;
  requiredDone: number;
  requiredTotal: number;
  /** The first stop not collected yet (in order), or null when every stop is. */
  next: number | null;
  /** Enough required stops for the finish (and the reward). */
  complete: boolean;
};

/**
 * A fan's progress on a trail, from which stops they have collected. Never stored: it is
 * read from their collects, so it can't drift.
 */
export function trailProgress(stops: ProgressStop[], minStops?: number | null): TrailProgress {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const required = sorted.filter((s) => s.required);
  const requiredDone = required.filter((s) => s.done).length;
  const need = Math.min(minStops ?? required.length, required.length);
  return {
    done: sorted.filter((s) => s.done).length,
    total: sorted.length,
    requiredDone,
    requiredTotal: required.length,
    next: sorted.find((s) => !s.done)?.position ?? null,
    complete: required.length > 0 && requiredDone >= need,
  };
}

/**
 * On an ordered trail, why a stop can't be collected yet: an earlier required stop is still
 * missing. Optional stops never block, and are never blocked. Null = it can be collected.
 */
export function orderLockReason(
  stops: ProgressStop[],
  position: number,
  order: string,
): string | null {
  if (order !== "ORDERED") return null;
  const target = stops.find((s) => s.position === position);
  if (!target?.required) return null;
  const missing = stops
    .filter((s) => s.required && !s.done && s.position < position)
    .sort((a, b) => a.position - b.position)[0];
  return missing ? `Collect stop ${missing.position} first` : null;
}
