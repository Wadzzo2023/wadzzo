import { ItemPrivacy, type Db } from "@wadzzo/db";
import { randomLocation } from "@wadzzo/geo";
import type { PinLookInput } from "@wadzzo/schemas/pin-look";
import { createOptimizedImage } from "@wadzzo/storage";

import { lookColumnsFor, lookData } from "./pin-look";

/** The "token" a pin form sends for "the brand page's asset" (no asset row). */
export const PAGE_ASSET_NUM = -10;

/** What a new regular pin is made from: the pin form (`createPin`) or a trail's New stop. */
export type NewPinFields = {
  creatorId: string;
  platformId: string;
  lat: number;
  lng: number;
  radius: number;
  pinNumber: number;
  title: string;
  description: string;
  image?: string;
  url?: string;
  startDate: Date;
  endDate: Date;
  autoCollect: boolean;
  pinCollectionLimit: number;
  /** "public" / "private" / a subscription tier id. */
  tier?: string;
  token?: number;
  multiPin?: boolean;
  look?: PinLookInput;
  /** Already checked (see checkLayer in shared/layers); null/absent = a regular map pin. */
  layerId?: string | null;
};

/**
 * The columns of a new regular pin and its locations: privacy from the tier, the asset (or the
 * page asset), `pinNumber` locations scattered in `radius`, an optimised image and the look.
 * Reads the database (the look's shape) and the image, so call it before a transaction.
 */
export async function newPinData(db: Db, f: NewPinFields) {
  let tierId: number | undefined;
  let privacy: ItemPrivacy = ItemPrivacy.PUBLIC;
  if (!f.tier || f.tier === "public") privacy = ItemPrivacy.PUBLIC;
  else if (f.tier === "private") privacy = ItemPrivacy.PRIVATE;
  else {
    tierId = Number(f.tier);
    privacy = ItemPrivacy.TIER;
  }

  let assetId = f.token;
  let pageAsset = false;
  if (f.token === PAGE_ASSET_NUM) {
    assetId = undefined;
    pageAsset = true;
  }

  const locations = Array.from({ length: f.pinNumber }).map(() => {
    const loc = randomLocation(f.lat, f.lng, f.radius);
    return { autoCollect: f.autoCollect, latitude: loc.latitude, longitude: loc.longitude };
  });

  const optimizedImage = f.image ? await createOptimizedImage(f.image).catch(() => null) : null;
  const look = await lookColumnsFor(db, f.creatorId, f.look);

  return {
    creatorId: f.creatorId,
    platformId: f.platformId,
    ...(look ? lookData(look) : {}),
    endDate: f.endDate,
    startDate: f.startDate,
    title: f.title,
    description: f.description,
    assetId,
    pageAsset,
    limit: f.pinCollectionLimit,
    image: f.image,
    optimizedImage,
    link: f.url,
    latitude: f.lat,
    longitude: f.lng,
    radius: f.radius,
    locations: { createMany: { data: locations } },
    subscriptionId: tierId,
    privacy,
    remaining: f.pinCollectionLimit,
    multiPin: f.multiPin,
    approved: true,
    layerId: f.layerId ?? null,
  };
}

type TagDb = Pick<Db, "locationTag" | "locationGroupTag">;

/**
 * Links tags to a new drop. Ids that no longer exist (a tag deleted since a template was saved)
 * are skipped instead of failing the whole create.
 */
export async function attachTags(db: TagDb, locationGroupId: string, tagIds: string[] | undefined) {
  if (!tagIds?.length) return;
  const existing = await db.locationTag.findMany({
    where: { id: { in: tagIds } },
    select: { id: true },
  });
  if (!existing.length) return;
  await db.locationGroupTag.createMany({
    data: existing.map((t) => ({ locationGroupId, tagId: t.id })),
    skipDuplicates: true,
  });
}

/** `attachTags` for several new drops at once: one lookup and one insert. */
export async function attachTagsToMany(
  db: TagDb,
  drops: { locationGroupId: string; tagIds: string[] | undefined }[],
) {
  const wanted = [...new Set(drops.flatMap((d) => d.tagIds ?? []))];
  if (!wanted.length) return;
  const existing = new Set(
    (await db.locationTag.findMany({ where: { id: { in: wanted } }, select: { id: true } })).map(
      (t) => t.id,
    ),
  );
  const data = drops.flatMap((d) =>
    (d.tagIds ?? [])
      .filter((t) => existing.has(t))
      .map((tagId) => ({ locationGroupId: d.locationGroupId, tagId })),
  );
  if (data.length) await db.locationGroupTag.createMany({ data, skipDuplicates: true });
}
