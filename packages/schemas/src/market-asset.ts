import type { Asset, MarketAsset } from "@wadzzo/db";

/** An asset as the browser may see it: without the issuer's secret or the platform stamp. */
export type AssetType = Omit<Asset, "issuerPrivate" | "platformId">;

/** A marketplace listing with its asset. */
export type MarketAssetType = Omit<MarketAsset, "platformId"> & {
  asset: AssetType;
};
