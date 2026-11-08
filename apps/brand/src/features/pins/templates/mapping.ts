import { PinType } from "@wadzzo/db";
import type { DrawShape, StoredFeature } from "@wadzzo/geo/map-geometry";
import {
  datesFromDays,
  datesFromMinutes,
  daysBetween,
  minutesBetween,
  type HotspotTemplateData,
  type PinTemplateData,
} from "@wadzzo/schemas/pin-template";

/**
 * Between the pin / hotspot forms and a saved template. Saving keeps what the
 * brand filled in (empty fields are left out) and turns dates into durations;
 * opening turns them back into dates starting now.
 */

type CollectionMode = "manual" | "auto";

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const int = (v: unknown, min: number) => {
  const n = num(v);
  return n !== undefined && Number.isInteger(n) && n >= min ? n : undefined;
};
const date = (v: unknown) => (v instanceof Date && !Number.isNaN(v.getTime()) ? v : undefined);
const isType = (v: unknown): v is PinType =>
  typeof v === "string" && (Object.values(PinType) as string[]).includes(v);
const isUrl = (v: unknown) => {
  const s = text(v);
  if (!s) return undefined;
  try {
    return new URL(s) && s;
  } catch {
    return undefined;
  }
};

/** A complete pin look, as templates store it. */
export type TemplateLook = NonNullable<PinTemplateData["look"]>;

/** Drops undefined keys, so the saved JSON only has what was filled in. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

// ── Pins ────────────────────────────────────────────────────────────────

export type PinFormLike = {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: PinType;
  lat?: number;
  lng?: number;
  radius?: number;
  pinNumber?: number;
  pinCollectionLimit?: number;
  tier?: string;
  token?: number;
  multiPin?: boolean;
  tags?: string[];
  startDate?: Date;
  endDate?: Date;
};

export function pinFormToTemplate(
  v: PinFormLike,
  opts: {
    mode: CollectionMode;
    includeLocation: boolean;
    durationMinutes?: number;
    look?: TemplateLook;
  },
): PinTemplateData {
  const start = date(v.startDate);
  const end = date(v.endDate);
  const lat = num(v.lat);
  const lng = num(v.lng);
  return compact({
    title: text(v.title)?.slice(0, 120),
    description: text(v.description)?.slice(0, 2000),
    image: isUrl(v.image),
    url: isUrl(v.url),
    type: isType(v.type) ? v.type : undefined,
    autoCollect: opts.mode === "auto",
    look: opts.look,
    radius: num(v.radius) !== undefined && v.radius! >= 0 ? v.radius : undefined,
    pinNumber: int(v.pinNumber, 1),
    pinCollectionLimit: int(v.pinCollectionLimit, 0),
    tier: text(v.tier),
    token: int(v.token, -1_000),
    multiPin: typeof v.multiPin === "boolean" ? v.multiPin : undefined,
    tags: v.tags?.length ? v.tags.slice(0, 50) : undefined,
    durationMinutes:
      opts.durationMinutes ??
      (start && end && end > start ? minutesBetween(start, end) : undefined),
    location:
      opts.includeLocation &&
      lat !== undefined &&
      lng !== undefined &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
        ? { lat, lng }
        : undefined,
  });
}

/**
 * Form values from a template. `at` (a spot picked on the map) wins over the
 * template's own location; without either, the location stays empty.
 */
export function templateToPinForm(
  d: PinTemplateData,
  now: Date,
  at?: { lat: number; lng: number } | null,
): { values: PinFormLike; mode: CollectionMode; look?: TemplateLook } {
  const where = at ?? d.location ?? null;
  const dates = d.durationMinutes ? datesFromMinutes(d.durationMinutes, now) : null;
  return {
    mode: d.autoCollect ? "auto" : "manual",
    look: d.look,
    values: compact({
      title: d.title,
      description: d.description,
      image: d.image,
      url: d.url,
      type: d.type,
      radius: d.radius,
      pinNumber: d.pinNumber,
      pinCollectionLimit: d.pinCollectionLimit,
      tier: d.tier,
      token: d.token,
      multiPin: d.multiPin,
      tags: d.tags,
      lat: where?.lat,
      lng: where?.lng,
      startDate: dates?.start,
      endDate: dates?.end,
    }),
  };
}

// ── Hotspots ────────────────────────────────────────────────────────────

export type HotspotFormLike = Omit<PinFormLike, "lat" | "lng" | "radius" | "tags"> & {
  dropEveryDays?: number;
  pinDurationDays?: number;
  hotspotStartDate?: Date;
  hotspotEndDate?: Date;
};

export function hotspotFormToTemplate(
  v: HotspotFormLike,
  opts: {
    mode: CollectionMode;
    area: { feature: StoredFeature; shape: DrawShape } | null;
    scheduleDays?: number;
    look?: TemplateLook;
  },
): HotspotTemplateData {
  const start = date(v.hotspotStartDate);
  const end = date(v.hotspotEndDate);
  return compact({
    title: text(v.title)?.slice(0, 120),
    description: text(v.description)?.slice(0, 2000),
    image: isUrl(v.image),
    url: isUrl(v.url),
    type: isType(v.type) ? v.type : undefined,
    autoCollect: opts.mode === "auto",
    look: opts.look,
    pinNumber: int(v.pinNumber, 1),
    pinCollectionLimit: int(v.pinCollectionLimit, 0),
    tier: text(v.tier),
    token: int(v.token, -1_000),
    multiPin: typeof v.multiPin === "boolean" ? v.multiPin : undefined,
    dropEveryDays: int(v.dropEveryDays, 1),
    pinDurationDays: int(v.pinDurationDays, 1),
    scheduleDays:
      opts.scheduleDays ?? (start && end && end > start ? daysBetween(start, end) : undefined),
    area: opts.area
      ? {
          shape: opts.area.shape,
          geoJson: opts.area.feature as NonNullable<HotspotTemplateData["area"]>["geoJson"],
        }
      : undefined,
  });
}

export function templateToHotspotForm(
  d: HotspotTemplateData,
  now: Date,
): { values: HotspotFormLike; mode: CollectionMode; look?: TemplateLook } {
  const dates = d.scheduleDays ? datesFromDays(d.scheduleDays, now) : null;
  return {
    mode: d.autoCollect ? "auto" : "manual",
    look: d.look,
    values: compact({
      title: d.title,
      description: d.description,
      image: d.image,
      url: d.url,
      type: d.type,
      pinNumber: d.pinNumber,
      pinCollectionLimit: d.pinCollectionLimit,
      tier: d.tier,
      token: d.token,
      multiPin: d.multiPin,
      dropEveryDays: d.dropEveryDays,
      pinDurationDays: d.pinDurationDays,
      hotspotStartDate: dates?.start,
      hotspotEndDate: dates?.end,
    }),
  };
}

/** A template's saved area as the map's stored feature, if it has one. */
export function templateArea(
  d: HotspotTemplateData,
): { feature: StoredFeature; shape: DrawShape } | null {
  return d.area ? { feature: d.area.geoJson as StoredFeature, shape: d.area.shape } : null;
}
