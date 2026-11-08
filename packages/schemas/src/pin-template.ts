import { PinType } from "@wadzzo/db";
import { z } from "zod";

import { pinLookInputSchema } from "./pin-look";

/**
 * Pin templates: a brand's saved pin or hotspot setup, reused to drop new ones.
 *
 * `data` holds the form's values. Dates are saved as durations ("runs 3 days"),
 * so a template never goes out of date; the location (pin) or drawn area
 * (hotspot) is optional. `schemaVersion` says which shape `data` is in, so a
 * later change to the form can upgrade old templates when they load instead
 * of breaking them.
 */
export const TEMPLATE_SCHEMA_VERSION = 1;

export const PIN_TEMPLATE_FORM_TYPES = ["PIN", "HOTSPOT"] as const;
export type PinTemplateFormType = (typeof PIN_TEMPLATE_FORM_TYPES)[number];

/** A brand can keep this many templates (per kind is plenty for any real use). */
export const MAX_TEMPLATES_PER_BRAND = 200;

const MINUTE = 1;
const DAY_MINUTES = 24 * 60;
/** Longest a pin template may say a pin runs for (about five years). */
const MAX_PIN_MINUTES = 5 * 366 * DAY_MINUTES;
/** Most corners a saved hotspot area may have (a drawn circle has 37). */
const MAX_AREA_POINTS = 2_000;

const latLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** A hotspot area in the portal's stored format: one closed ring of [lat, lng]. */
const storedArea = z
  .object({
    type: z.literal("Feature"),
    properties: z
      .object({
        center: z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]).optional(),
        radiusMetres: z.number().positive().optional(),
      })
      .nullable()
      .optional(),
    geometry: z.object({
      type: z.literal("Polygon"),
      coordinates: z
        .array(
          z
            .array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]))
            .min(4)
            .max(MAX_AREA_POINTS + 1),
        )
        .length(1),
    }),
  })
  .refine(
    (f) => {
      const ring = f.geometry.coordinates[0]!;
      const a = ring[0]!;
      const b = ring[ring.length - 1]!;
      return a[0] === b[0] && a[1] === b[1];
    },
    { message: "The area's outline must be closed" },
  );

/** What both kinds of template share: the pin's details and collection rules. */
const sharedFields = {
  title: z.string().max(120),
  description: z.string().max(2000),
  image: z.url(),
  url: z.url(),
  type: z.enum(PinType),
  autoCollect: z.boolean(),
  pinNumber: z.number().int().min(1).max(1000),
  pinCollectionLimit: z.number().int().min(0),
  tier: z.string().max(40),
  token: z.number().int(),
  multiPin: z.boolean(),
  /** Shape, what fills it, colour, image fit and badge (see ./pin-look). */
  look: pinLookInputSchema,
};

const pinFields = {
  ...sharedFields,
  radius: z.number().min(0).max(100_000),
  tags: z.array(z.string().max(64)).max(50),
  /** How long each dropped pin runs, from when it is dropped. */
  durationMinutes: z.number().int().min(MINUTE).max(MAX_PIN_MINUTES),
  location: latLng,
};

const hotspotFields = {
  ...sharedFields,
  dropEveryDays: z.number().int().min(1).max(365),
  pinDurationDays: z.number().int().min(1).max(365),
  /** How long the hotspot keeps dropping, from when it is created. */
  scheduleDays: z.number().int().min(1).max(3650),
  area: z.object({
    shape: z.enum(["polygon", "rectangle", "circle"]),
    geoJson: storedArea,
  }),
};

type Fields = Record<string, z.ZodType>;
const partial = <T extends Fields>(f: T) =>
  z.object(
    Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.optional()])) as {
      [K in keyof T]: z.ZodOptional<T[K]>;
    },
  );
/** Reading a saved template: a field that no longer checks out is dropped, not the whole template. */
const lenient = <T extends Fields>(f: T) =>
  z.object(
    Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.optional().catch(undefined)])) as {
      [K in keyof T]: z.ZodCatch<z.ZodOptional<T[K]>>;
    },
  );

/** What the form sends when saving: every field optional (a template may be half-filled). */
export const pinTemplateDataSchema = partial(pinFields);
export const hotspotTemplateDataSchema = partial(hotspotFields);

export type PinTemplateData = z.infer<typeof pinTemplateDataSchema>;
export type HotspotTemplateData = z.infer<typeof hotspotTemplateDataSchema>;

const readPin = lenient(pinFields);
const readHotspot = lenient(hotspotFields);

export const templateNameSchema = z
  .string()
  .trim()
  .min(1, "Give the template a name")
  .max(80, "Keep the name under 80 characters");

const saveInput = z.discriminatedUnion("formType", [
  z.object({ formType: z.literal("PIN"), data: pinTemplateDataSchema }),
  z.object({ formType: z.literal("HOTSPOT"), data: hotspotTemplateDataSchema }),
]);

export const createPinTemplateSchema = z
  .object({ name: templateNameSchema, creatorId: z.string().optional() })
  .and(saveInput);

export const updatePinTemplateSchema = z.object({
  id: z.string(),
  name: templateNameSchema.optional(),
  /** Replaces the saved values (the kind of template can't change). */
  data: z.union([pinTemplateDataSchema, hotspotTemplateDataSchema]).optional(),
});

/**
 * A saved template's data, upgraded to the current shape. Anything unreadable
 * is left out, so a template always opens (with fewer fields filled at worst).
 */
export function readTemplateData(
  formType: "PIN",
  raw: unknown,
  schemaVersion?: number,
): PinTemplateData;
export function readTemplateData(
  formType: "HOTSPOT",
  raw: unknown,
  schemaVersion?: number,
): HotspotTemplateData;
export function readTemplateData(
  formType: PinTemplateFormType,
  raw: unknown,
  schemaVersion?: number,
): PinTemplateData | HotspotTemplateData;
export function readTemplateData(
  formType: PinTemplateFormType,
  raw: unknown,
  schemaVersion = TEMPLATE_SCHEMA_VERSION,
): PinTemplateData | HotspotTemplateData {
  const upgraded = upgrade(raw, schemaVersion);
  const parsed = (formType === "PIN" ? readPin : readHotspot).safeParse(upgraded);
  if (!parsed.success) return {};
  // drop the keys that came back undefined, so spreading over defaults keeps the defaults
  return Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
}

/** Step older versions up to the current one. Version 1 is the first, so nothing to do yet. */
function upgrade(raw: unknown, _from: number): unknown {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

/** Whether saved data carries a location (pin) or a drawn area (hotspot). */
export function templateHasLocation(
  formType: PinTemplateFormType,
  data: PinTemplateData | HotspotTemplateData,
) {
  return formType === "PIN"
    ? Boolean((data as PinTemplateData).location)
    : Boolean((data as HotspotTemplateData).area);
}

/** Minutes between two dates, at least one minute. */
export function minutesBetween(start: Date, end: Date) {
  return Math.max(MINUTE, Math.round((end.getTime() - start.getTime()) / 60_000));
}

/** Whole days between two dates, at least one day. */
export function daysBetween(start: Date, end: Date) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

/** The start and end a template's duration turns into, starting `now`. */
export function datesFromMinutes(minutes: number, now: Date) {
  return { start: new Date(now), end: new Date(now.getTime() + minutes * 60_000) };
}

export function datesFromDays(days: number, now: Date) {
  return { start: new Date(now), end: new Date(now.getTime() + days * 86_400_000) };
}

/** "3 days", "2 hours", "1 day 4 hours": how a duration reads on a template card. */
export function describeMinutes(minutes: number) {
  const days = Math.floor(minutes / DAY_MINUTES);
  const hours = Math.floor((minutes % DAY_MINUTES) / 60);
  const mins = minutes % 60;
  const part = (n: number, unit: string) => (n ? `${n} ${unit}${n === 1 ? "" : "s"}` : "");
  return (
    [part(days, "day"), part(hours, "hour"), days ? "" : part(mins, "minute")]
      .filter(Boolean)
      .join(" ") || "1 minute"
  );
}
