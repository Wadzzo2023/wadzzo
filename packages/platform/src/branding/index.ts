import { clintonCountyBranding } from "./clintoncounty";
import type { PlatformBranding } from "./types";
import { wadzzoBranding } from "./wadzzo";

export type { PlatformBranding } from "./types";

const BRANDINGS: Readonly<Record<string, PlatformBranding>> = {
  [wadzzoBranding.slug]: wadzzoBranding,
  [clintonCountyBranding.slug]: clintonCountyBranding,
};

/** The branding of `slug`; unknown slugs fall back to Wadzzo's. */
export const getPlatformBranding = (slug: string): PlatformBranding =>
  BRANDINGS[slug] ?? wadzzoBranding;

/**
 * The branding of this deployment. `NEXT_PUBLIC_PLATFORM_SLUG` is set from
 * `PLATFORM_SLUG` by each app's next.config.js so browser bundles know it too.
 */
export const platformBranding: PlatformBranding = getPlatformBranding(
  process.env.NEXT_PUBLIC_PLATFORM_SLUG ?? process.env.PLATFORM_SLUG ?? "wadzzo",
);
