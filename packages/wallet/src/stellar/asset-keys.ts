import { AppError } from "@wadzzo/errors";

/** `CODE-ISSUER`, the key assets are stored and passed around by. */
export const concatAssetWithIssuer = (assetCode: string, assetIssuer: string): string =>
  `${assetCode}-${assetIssuer}`;

export function splitAssetKey(assetKey: string): [code: string, issuer: string] {
  const [code, issuer, ...rest] = assetKey.split("-");
  if (!code || !issuer || rest.length > 0) {
    throw new AppError("VALIDATION_FAILED", {
      message: `"${assetKey}" is not a CODE-ISSUER asset key.`,
    });
  }
  return [code, issuer];
}
