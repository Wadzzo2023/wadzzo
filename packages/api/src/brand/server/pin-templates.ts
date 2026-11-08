// Pin templates: a brand's saved pin / hotspot setups. Plain reads and writes on `PinTemplate`;
// who may touch which brand's templates is checked by the router before these run.

import type { Db, Prisma } from "@wadzzo/db";
import { AppError, ErrorCodes } from "@wadzzo/errors";
import {
  hotspotTemplateDataSchema,
  MAX_TEMPLATES_PER_BRAND,
  pinTemplateDataSchema,
  readTemplateData,
  TEMPLATE_SCHEMA_VERSION,
  templateHasLocation,
  type HotspotTemplateData,
  type PinTemplateData,
  type PinTemplateFormType,
} from "@wadzzo/schemas/pin-template";

const SELECT = {
  id: true,
  creatorId: true,
  platformId: true,
  name: true,
  formType: true,
  data: true,
  schemaVersion: true,
  hasLocation: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Row = Prisma.PinTemplateGetPayload<{ select: typeof SELECT }>;

const asFormType = (t: string): PinTemplateFormType => (t === "HOTSPOT" ? "HOTSPOT" : "PIN");

/** A row as the app sees it: data upgraded and cleaned, so the form can always open it. */
function present(
  row: Row,
):
  | (Omit<Row, "formType" | "data"> & { formType: "PIN"; data: PinTemplateData })
  | (Omit<Row, "formType" | "data"> & { formType: "HOTSPOT"; data: HotspotTemplateData }) {
  const { data, ...rest } = row;
  return asFormType(row.formType) === "PIN"
    ? { ...rest, formType: "PIN", data: readTemplateData("PIN", data, row.schemaVersion) }
    : { ...rest, formType: "HOTSPOT", data: readTemplateData("HOTSPOT", data, row.schemaVersion) };
}
export type PinTemplateView = ReturnType<typeof present>;

/** Checks `data` against its kind's schema (a pin template can't carry hotspot fields). */
function checkData(formType: PinTemplateFormType, data: unknown) {
  const parsed = (formType === "PIN" ? pinTemplateDataSchema : hotspotTemplateDataSchema).safeParse(
    data,
  );
  if (!parsed.success)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: "Some of the template's values aren't valid",
    });
  return parsed.data;
}

export function pinTemplates(db: Db) {
  async function find(id: string) {
    const row = await db.pinTemplate.findUnique({ where: { id }, select: SELECT });
    if (!row) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Template not found" });
    return row;
  }

  async function assertRoom(creatorId: string) {
    const count = await db.pinTemplate.count({ where: { creatorId } });
    if (count >= MAX_TEMPLATES_PER_BRAND)
      throw new AppError(ErrorCodes.VALIDATION_FAILED, {
        message: `You can keep up to ${MAX_TEMPLATES_PER_BRAND} templates — delete some you no longer use`,
      });
  }

  return {
    /** The raw row, for the router's access check (owner and platform). */
    find,

    async get(id: string) {
      return present(await find(id));
    },

    async list(creatorId: string, formType?: PinTemplateFormType) {
      const rows = await db.pinTemplate.findMany({
        where: { creatorId, ...(formType ? { formType } : {}) },
        select: SELECT,
        orderBy: { updatedAt: "desc" },
      });
      return rows.map(present);
    },

    async create(
      creatorId: string,
      platformId: string,
      input: { name: string; formType: PinTemplateFormType; data: unknown },
    ) {
      await assertRoom(creatorId);
      const data = checkData(input.formType, input.data);
      const row = await db.pinTemplate.create({
        data: {
          creatorId,
          platformId,
          name: input.name.trim(),
          formType: input.formType,
          data: data,
          schemaVersion: TEMPLATE_SCHEMA_VERSION,
          hasLocation: templateHasLocation(input.formType, data),
        },
        select: SELECT,
      });
      return present(row);
    },

    async update(id: string, input: { name?: string; data?: unknown }) {
      const row = await find(id);
      const formType = asFormType(row.formType);
      const data = input.data === undefined ? undefined : checkData(formType, input.data);
      const updated = await db.pinTemplate.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(data !== undefined
            ? {
                data: data,
                schemaVersion: TEMPLATE_SCHEMA_VERSION,
                hasLocation: templateHasLocation(formType, data),
              }
            : {}),
        },
        select: SELECT,
      });
      return present(updated);
    },

    async duplicate(id: string) {
      const row = await find(id);
      await assertRoom(row.creatorId);
      const copy = await db.pinTemplate.create({
        data: {
          creatorId: row.creatorId,
          platformId: row.platformId,
          name: `${row.name} (copy)`.slice(0, 80),
          formType: row.formType,
          data: row.data as Prisma.InputJsonValue,
          schemaVersion: row.schemaVersion,
          hasLocation: row.hasLocation,
        },
        select: SELECT,
      });
      return present(copy);
    },

    async remove(id: string) {
      await find(id);
      await db.pinTemplate.delete({ where: { id } });
      return { id };
    },
  };
}
