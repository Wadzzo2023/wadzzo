import { env } from "~/env";
import { concatAssetWithIssuer } from "./utils";

export const ACTION_ISSUER =
  "GABHBO4IAEAKYODTIQC5G43MPD55BREA4P3MAXAMZKLEVQNF3S7PZFDU";

export const ACTION_ASSET_CODE = "ACTION";
export const HORIZON_URL = "https://horizon.stellar.org"; // Horizon server for pubnet

export const ASSETS: string[] = [
  concatAssetWithIssuer(ACTION_ASSET_CODE, ACTION_ISSUER),
];

export const DEFAULT_ASSET_LIMIT = "0.0000001";
export const DEFAULT_ASSET_PRICE = "1"; // XLM

export const STELLAR_URL = env.NEXT_PUBLIC_STELLAR_PUBNET
  ? "https://horizon.stellar.org"
  : "https://horizon-testnet.stellar.org";

export const STORAGE_SECRET = env.NEXT_PUBLIC_STELLAR_PUBNET
  ? "***REMOVED***"
  : "***REMOVED***";

export const STORAGE_PUB = env.NEXT_PUBLIC_STELLAR_PUBNET
  ? "GDBUPMEXP6DKKS7HI4P6HNM5CUVM6WJF7SEH3GRXXH5TQ6XZQKYGIQKC"
  : "GD5UILGTWNRIWERORCB7YBLDRITMVP47QZ25UPYBJHHHHSM5AFE73HHB";

export const MOTHER_SECRET = env.NEXT_PUBLIC_STELLAR_PUBNET
  ? "***REMOVED***"
  : "***REMOVED***";
