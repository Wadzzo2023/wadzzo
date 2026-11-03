import { platformBranding } from "@wadzzo/platform/branding";
import { PLATFORM_ASSET } from "@wadzzo/wallet/config";

/**
 * AR shows the marketplace but doesn't sell: buying happens in the marketplace app, which has the
 * wallet, checkout and resale flows. These build the links over there.
 */
const fanApp = platformBranding.urls.fanApp.replace(/\/$/, "");

/** The item's page in the marketplace app, opened on one fan resale when `listingId` is given. */
export function marketplaceItemUrl(assetId: number, listingId?: number | null) {
  return `${fanApp}/item/${assetId}${listingId != null ? `?listing=${listingId}` : ""}`;
}

export const marketplaceUrl = `${fanApp}/marketplace`;

export const TOKEN_CODE = PLATFORM_ASSET.code;

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** 1,250 → "1,250"; 18,234,000 → "18.2M", so prices fit a two-column card. */
export function formatPrice(n: number) {
  return n >= 100_000 ? compact.format(n) : full.format(n);
}

export function formatUsd(n: number | null | undefined) {
  if (n == null) return null;
  return `≈ $${n >= 100_000 ? compact.format(n) : full.format(n)}`;
}

export const MEDIA_LABEL: Record<string, string> = {
  IMAGE: "Image",
  MUSIC: "Music",
  VIDEO: "Video",
  THREE_D: "3D",
};
