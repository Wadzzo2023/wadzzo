import { AppError } from "@wadzzo/errors";

/**
 * White-label scoping rules (pure; no DB). Every deployment serves one Platform
 * (PLATFORM_SLUG). The root platform (wadzzo) sees and manages every platform's
 * rows; any other platform only its own.
 */
export type ScopePlatform = { id: string; isRoot: boolean };
export type PlatformContext = { platform: ScopePlatform };

/**
 * `where` fragment limiting a query to the rows this deployment may see. On the
 * root platform `filter` (the admin panel's platform dropdown) narrows it to one
 * platform; elsewhere it is ignored.
 */
export function platformScope(
  ctx: PlatformContext,
  filter?: string | null,
): { platformId?: string } {
  if (!ctx.platform.isRoot) return { platformId: ctx.platform.id };
  return filter ? { platformId: filter } : {};
}

/** True when this deployment may see a row stamped with `platformId`. */
export function isInPlatformScope(ctx: PlatformContext, platformId: string | null | undefined) {
  return ctx.platform.isRoot || ctx.platform.id === platformId;
}

/** Throws RESOURCE_NOT_FOUND for a row outside this deployment's scope, so its existence isn't revealed. */
export function assertInPlatformScope(ctx: PlatformContext, platformId: string | null | undefined) {
  if (!isInPlatformScope(ctx, platformId)) {
    throw new AppError("RESOURCE_NOT_FOUND", { message: "NOT_FOUND" });
  }
}

/**
 * Whether an admin of `adminPlatformId` may use this deployment's admin panel:
 * its own platform's panel, or any panel when the admin belongs to the root platform.
 */
export function canAdminPlatform(
  admin: { platformId: string; platform: { isRoot: boolean } },
  platform: ScopePlatform,
) {
  return admin.platform.isRoot || admin.platformId === platform.id;
}

/**
 * Whether a brand of `brandPlatformId` may work in this deployment's brand
 * portal: its own platform's portal, or the root (Wadzzo) portal, where every
 * platform's brands can manage and drop pins (the pins keep the brand's own
 * platform, so they show on both).
 */
export function brandWorksOnPlatform(
  platform: ScopePlatform,
  brandPlatformId: string | null | undefined,
) {
  return platform.isRoot || platform.id === brandPlatformId;
}

/**
 * `platformScope` for an optional relation (e.g. `location.locationGroup`):
 * undefined when unscoped, so rows without the relation stay visible on Wadzzo.
 */
export function relationScope(ctx: PlatformContext, filter?: string | null) {
  const scope = platformScope(ctx, filter);
  return scope.platformId ? scope : undefined;
}
