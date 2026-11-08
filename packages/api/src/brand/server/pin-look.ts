// Pin look on the server: turning what a form sent into the stored columns (checking a brand
// shape really is that brand's), and the shapes a brand can pick from.

import { Prisma, type Db } from "@wadzzo/db";
import { AppError, ErrorCodes } from "@wadzzo/errors";
import {
  isBuiltinShape,
  lookToColumns,
  pinLookInputSchema,
  type PinLookColumns,
  type PinLookInput,
} from "@wadzzo/schemas/pin-look";

/** Select this on a pin or hotspot to be able to draw its look. */
export const PIN_LOOK_SELECT = {
  markerShape: true,
  pinShapeId: true,
  markerFill: true,
  markerColor: true,
  markerImageFit: true,
  markerAutoBadge: true,
  pinShape: { select: { path: true, anchor: true } },
} as const;

/**
 * The columns to store for `look` on `creatorId`'s pin or hotspot. A shape id
 * that isn't built in must be one of that brand's own shapes (archived ones
 * included, so a template or an existing pin keeps working).
 * `undefined` look = leave the stored look alone (for updates).
 */
export async function lookColumnsFor(
  db: Db,
  creatorId: string,
  look: PinLookInput | null | undefined,
): Promise<PinLookColumns | undefined> {
  if (look === undefined) return undefined;
  const parsed = pinLookInputSchema.parse(look ?? {});
  const shape = parsed.shape ?? null;
  if (!shape || isBuiltinShape(shape)) return lookToColumns(parsed, false);
  const own = await db.pinShape.findFirst({
    where: { id: shape, creatorId },
    select: { id: true },
  });
  if (!own)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: "That pin shape isn't available — choose another",
    });
  return lookToColumns(parsed, true);
}

/** Look columns as Prisma write data (a missing image fit is SQL NULL). */
export function lookData(c: PinLookColumns) {
  return {
    markerShape: c.markerShape,
    pinShapeId: c.pinShapeId,
    markerFill: c.markerFill,
    markerColor: c.markerColor,
    markerImageFit:
      c.markerImageFit == null ? Prisma.DbNull : (c.markerImageFit as Prisma.InputJsonValue),
    markerAutoBadge: c.markerAutoBadge,
  };
}

/** Copies the look columns from one row (a hotspot) for another (its drop). */
export function copyLook(from: Partial<PinLookColumns>): PinLookColumns {
  return {
    markerShape: from.markerShape ?? null,
    pinShapeId: from.pinShapeId ?? null,
    markerFill: from.markerFill ?? "BRAND",
    markerColor: from.markerColor ?? null,
    markerImageFit: from.markerImageFit ?? null,
    markerAutoBadge: from.markerAutoBadge ?? true,
  };
}
