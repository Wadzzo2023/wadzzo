import { Box, Image as ImageIcon, Music, Video, type LucideIcon } from "lucide-react-native";
import { Linking } from "react-native";

import type { MarketMediaType } from "~/lib/api/types";

/**
 * The app shows the marketplace but doesn't sell: buying, wallets and resales happen in the
 * marketplace web app. These build the links there (same as the AR web app's "Go to Marketplace").
 */
export const MARKETPLACE_URL = (process.env.EXPO_PUBLIC_MARKETPLACE_URL ?? "https://web.wadzzo.com").replace(/\/$/, "");

/** The item's page in the marketplace, opened on one fan resale when `listingId` is given. */
export function marketplaceItemUrl(assetId: number, listingId?: number | null) {
  return `${MARKETPLACE_URL}/item/${assetId}${listingId != null ? `?listing=${listingId}` : ""}`;
}

export function openMarketplace(assetId?: number, listingId?: number | null) {
  void Linking.openURL(assetId == null ? `${MARKETPLACE_URL}/marketplace` : marketplaceItemUrl(assetId, listingId));
}

/** 18,234,000 → "18.2M" (by hand: Hermes' Intl has no reliable compact notation). */
function compact(n: number) {
  for (const [v, sfx] of [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]] as const) {
    if (n >= v) return `${(n / v).toFixed(1).replace(/\.0$/, "")}${sfx}`;
  }
  return String(n);
}

/** Thousands separators, at most two decimals. */
function full(n: number) {
  const [int, dec] = (Math.round(n * 100) / 100).toString().split(".");
  return int!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (dec ? `.${dec}` : "");
}

/** 1,250 → "1,250"; 18,234,000 → "18.2M", so amounts fit a two-column card or a header capsule. */
export function formatAmount(n: number) {
  return n >= 100_000 ? compact(n) : full(n);
}

export const formatPrice = formatAmount;

export function formatUsd(n: number | null | undefined) {
  if (n == null) return null;
  return `≈ $${formatAmount(n)}`;
}

export const MEDIA: Record<MarketMediaType, { label: string; icon: LucideIcon }> = {
  IMAGE: { label: "Image", icon: ImageIcon },
  MUSIC: { label: "Music", icon: Music },
  VIDEO: { label: "Video", icon: Video },
  THREE_D: { label: "3D", icon: Box },
};
