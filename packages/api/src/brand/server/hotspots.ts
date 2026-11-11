// Hotspots: create, pause, resume, change and delete. The app writes the rows; the worker's
// `hotspot_drop` look (apps/express-wadzzo/src/lib/hotspot-drop.ts) reads them every few minutes and
// makes the drops. Nothing here talks to another server, and no schedule has to be started or
// stopped: a hotspot that is active is looked after, one that is paused or deleted is not.

import { ItemPrivacy, PinType, Prisma } from "@wadzzo/db";
import type { Db } from "@wadzzo/db";
import { AppError, ErrorCodes } from "@wadzzo/errors";
import { generateRandomLocations } from "@wadzzo/geo";
import { DAY_MS, START_TOLERANCE_MS, isPendingFirstDrop } from "@wadzzo/geo/hotspot-schedule";
import type { PinLookColumns } from "@wadzzo/schemas/pin-look";

import { lookData } from "./pin-look";

/** A token value that means "the brand's page asset" rather than an asset id. */
const PAGE_ASSET_NUM = -10;

export interface CreateHotspotInput {
  title: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
  dropEveryDays: number;
  pinDurationDays: number;
  hotspotStartDate: string; // ISO datetime
  hotspotEndDate: string; // ISO datetime
  pinNumber: number;
  pinCollectionLimit: number;
  autoCollect: boolean;
  multiPin?: boolean;
  hotspotShape: "circle" | "rectangle" | "polygon";
  geoJson?: unknown;
  token?: number;
  tier?: string;
  creatorId: string;
  /** Pin look for every drop (already checked; see lookColumnsFor). Default look when left out. */
  look?: PinLookColumns;
  /** Map layer for every drop (already checked; see checkLayer); null = regular pins. */
  layerId?: string | null;
}

export interface UpdateHotspotInput {
  hotspotStartDate?: string;
  hotspotEndDate?: string;
  dropEveryDays?: number;
  pinDurationDays?: number;
  autoCollect?: boolean;
  multiPin?: boolean;
  /** Which existing drops the collection settings apply to. */
  scope?: "future_drops" | "all_drops";
  /** New pin look; applies to every drop, past and future (it's only how they're drawn). */
  look?: PinLookColumns;
  /** New map layer (already checked); every drop moves with it. Left out = unchanged. */
  layerId?: string | null;
}

export interface HotspotActionResult {
  ok: boolean;
  hotspotId: string;
  isActive?: boolean;
}

function resolveTier(tier?: string): { privacy: ItemPrivacy; tierId: number | undefined } {
  if (!tier || tier === "public") return { privacy: ItemPrivacy.PUBLIC, tierId: undefined };
  if (tier === "private") return { privacy: ItemPrivacy.PRIVATE, tierId: undefined };
  return { privacy: ItemPrivacy.TIER, tierId: Number(tier) };
}

const invalid = (message: string) => new AppError(ErrorCodes.VALIDATION_FAILED, { message });
const notFound = () =>
  new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Hotspot not found" });

export function hotspots(db: Db) {
  /** The brand's own hotspot, or "not found" (another brand's is not found either). */
  async function own(creatorId: string, hotspotId: string) {
    const found = await db.hotspot.findFirst({
      where: { id: hotspotId, creatorId },
      select: { id: true },
    });
    if (!found) throw notFound();
    return found;
  }

  return {
    async create(creatorId: string, input: CreateHotspotInput): Promise<{ hotspotId: string }> {
      const { privacy, tierId } = resolveTier(input.tier);
      let assetId: number | undefined = input.token;
      let pageAsset = false;
      if (input.token === PAGE_ASSET_NUM) {
        assetId = undefined;
        pageAsset = true;
      }

      const now = new Date();
      const hotspotStartDate = new Date(input.hotspotStartDate);
      const hotspotEndDate = new Date(input.hotspotEndDate);
      if (hotspotEndDate <= hotspotStartDate)
        throw invalid("hotspotEndDate must be after hotspotStartDate");

      // Starting later: the first drop is made now (it carries the content later drops copy) but
      // stays hidden until the start date, when the worker releases it. Starting now: it is live
      // straight away.
      const startsLater = hotspotStartDate.getTime() > now.getTime() + START_TOLERANCE_MS;
      const firstDropStart = startsLater ? hotspotStartDate : now;
      const firstDropEnd = new Date(firstDropStart.getTime() + input.pinDurationDays * DAY_MS);

      // Hotspots and their drops live on their brand's white-label platform.
      const { platformId } = await db.creator.findUniqueOrThrow({
        where: { id: creatorId },
        select: { platformId: true },
      });
      const hotspot = await db.hotspot.create({
        data: {
          creatorId,
          platformId,
          autoCollect: input.autoCollect,
          dropEveryDays: input.dropEveryDays,
          pinDurationDays: input.pinDurationDays,
          hotspotStartDate,
          hotspotEndDate,
          shape: input.hotspotShape,
          geoJson: (input.geoJson as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
          isActive: true,
          layerId: input.layerId ?? null,
          ...(input.look ? lookData(input.look) : {}),
          locationGroups: {
            create: {
              creatorId,
              platformId,
              title: input.title,
              description: input.description,
              image: input.image,
              link: input.url,
              type: (input.type as PinType | undefined) ?? "OTHER",
              privacy,
              multiPin: input.multiPin ?? false,
              assetId,
              pageAsset,
              latitude: 0,
              longitude: 0,
              radius: 0,
              limit: input.pinCollectionLimit,
              remaining: input.pinCollectionLimit,
              subscriptionId: tierId,
              startDate: firstDropStart,
              endDate: firstDropEnd,
              hidden: startsLater,
              approved: true,
              layerId: input.layerId ?? null,
              ...(input.look ? lookData(input.look) : {}),
              locations: {
                createMany: {
                  data: generateRandomLocations(
                    input.hotspotShape,
                    (input.geoJson as never) ?? null,
                    input.pinNumber,
                  ).map((loc) => ({
                    autoCollect: input.autoCollect,
                    latitude: loc.latitude,
                    longitude: loc.longitude,
                  })),
                },
              },
            },
          },
        },
      });
      return { hotspotId: hotspot.id };
    },

    async pause(creatorId: string, hotspotId: string): Promise<HotspotActionResult> {
      await own(creatorId, hotspotId);
      await db.hotspot.update({ where: { id: hotspotId }, data: { isActive: false } });
      return { ok: true, hotspotId, isActive: false };
    },

    async resume(creatorId: string, hotspotId: string): Promise<HotspotActionResult> {
      await own(creatorId, hotspotId);
      await db.hotspot.update({ where: { id: hotspotId }, data: { isActive: true } });
      return { ok: true, hotspotId, isActive: true };
    },

    /** Change the schedule or the collection settings. The worker's next look uses the new ones. */
    async update(
      creatorId: string,
      hotspotId: string,
      input: UpdateHotspotInput,
    ): Promise<HotspotActionResult> {
      const hotspot = await db.hotspot.findFirst({
        where: { id: hotspotId, creatorId, hidden: false },
        select: {
          id: true,
          isActive: true,
          createdAt: true,
          dropEveryDays: true,
          pinDurationDays: true,
          hotspotStartDate: true,
          hotspotEndDate: true,
          locationGroups: {
            where: { hidden: true },
            select: { id: true, hidden: true, startDate: true, createdAt: true },
          },
        },
      });
      if (!hotspot) throw notFound();

      const now = new Date();
      const scope = input.scope ?? "future_drops";
      const pending = hotspot.locationGroups.find(isPendingFirstDrop) ?? null;
      const start = input.hotspotStartDate
        ? new Date(input.hotspotStartDate)
        : hotspot.hotspotStartDate;
      const end = input.hotspotEndDate ? new Date(input.hotspotEndDate) : hotspot.hotspotEndDate;
      // The edit form always sends the start date: only a changed one is checked.
      const startChanged =
        Boolean(input.hotspotStartDate) && start.getTime() !== hotspot.hotspotStartDate.getTime();
      if (startChanged && !pending)
        throw invalid("The hotspot has already started — its start date can't change.");
      if (startChanged && start < now) throw invalid("The start date must be in the future.");
      if (end <= start) throw invalid("The end date must be after the start date.");

      await db.hotspot.update({
        where: { id: hotspot.id },
        data: {
          hotspotStartDate: start,
          hotspotEndDate: end,
          dropEveryDays: input.dropEveryDays,
          pinDurationDays: input.pinDurationDays,
          autoCollect: input.autoCollect,
          multiPin: input.multiPin,
          ...(input.look ? lookData(input.look) : {}),
          ...(input.layerId !== undefined && { layerId: input.layerId }),
        },
      });
      if (input.look || input.layerId !== undefined)
        await db.locationGroup.updateMany({
          where: { hotspotId: hotspot.id },
          data: {
            ...(input.look ? lookData(input.look) : {}),
            ...(input.layerId !== undefined && { layerId: input.layerId }),
          },
        });

      // The first drop is waiting for the start: keep it dated for the (new) start.
      if (pending && (input.hotspotStartDate || input.pinDurationDays)) {
        const duration = input.pinDurationDays ?? hotspot.pinDurationDays;
        await db.locationGroup.update({
          where: { id: pending.id },
          data: { startDate: start, endDate: new Date(start.getTime() + duration * DAY_MS) },
        });
      }

      // Collection settings carry over to existing drops in the chosen scope.
      const groupScope = {
        hotspotId: hotspot.id,
        ...(scope === "future_drops" ? { startDate: { gte: now } } : {}),
      };
      if (input.autoCollect !== undefined) {
        await db.location.updateMany({
          where: { locationGroup: groupScope },
          data: { autoCollect: input.autoCollect },
        });
      }
      if (input.multiPin !== undefined) {
        await db.locationGroup.updateMany({
          where: groupScope,
          data: { multiPin: input.multiPin },
        });
      }
      return { ok: true, hotspotId: hotspot.id };
    },

    async delete(creatorId: string, hotspotId: string): Promise<HotspotActionResult> {
      await own(creatorId, hotspotId);
      await db.locationGroup.updateMany({ where: { hotspotId }, data: { hidden: true } });
      await db.hotspot.update({
        where: { id: hotspotId },
        data: { isActive: false, hidden: true },
      });
      return { ok: true, hotspotId };
    },
  };
}
