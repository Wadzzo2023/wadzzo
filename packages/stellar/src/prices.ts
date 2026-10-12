import axios from "axios";

import { AppError, ErrorCodes } from "@wadzzo/errors";
import { PLATFORM_ASSET, stellarNetwork } from "@wadzzo/wallet/config";

/**
 * Exchange rates for quotes. Cached for a minute so a quote and the
 * transaction built right after it use the same numbers.
 */
const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8000;
/** USD per Wadzzo token (pegged at one cent), also what test networks use. */
const PEGGED_PLATFORM_USD = 0.01;

const cache = new Map<string, { value: number; loadedAt: number }>();

/** Forget cached rates (tests). */
export const clearPriceCache = () => cache.clear();

async function cached(key: string, load: () => Promise<number>): Promise<number> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit.value;

  const value = await load();
  cache.set(key, { value, loadedAt: Date.now() });
  return value;
}

const isUsablePrice = (price: unknown): price is number =>
  typeof price === "number" && Number.isFinite(price) && price > 0;

/** USD per XLM: Stellar Expert, then Binance if that is down. */
export function xlmUsd(): Promise<number> {
  return cached("xlm", async () => {
    try {
      const { data } = await axios.get<{ price?: number }>(
        "https://api.stellar.expert/explorer/public/asset/XLM",
        { timeout: REQUEST_TIMEOUT_MS },
      );
      if (isUsablePrice(data.price)) return data.price;
    } catch {
      /* fall through to Binance */
    }

    try {
      const { data } = await axios.get<{ price: string }>(
        "https://api.binance.com/api/v3/avgPrice?symbol=XLMUSDT",
        { timeout: REQUEST_TIMEOUT_MS },
      );
      const price = Number.parseFloat(data.price);
      if (isUsablePrice(price)) return price;
    } catch (cause) {
      throw ratesUnavailable(cause);
    }
    throw ratesUnavailable();
  });
}

/** USD per platform token. Wadzzo, and every token on testnet, is pegged at one cent. */
export function platformUsd(): Promise<number> {
  if (PLATFORM_ASSET.code.toLowerCase() === "wadzzo" || !stellarNetwork.isMainnet) {
    return Promise.resolve(PEGGED_PLATFORM_USD);
  }

  return cached("platform", async () => {
    try {
      const { data } = await axios.get<{ price?: number }>(
        `https://api.stellar.expert/explorer/public/asset/${PLATFORM_ASSET.code}-${PLATFORM_ASSET.issuer}`,
        { timeout: REQUEST_TIMEOUT_MS },
      );
      return isUsablePrice(data.price) ? data.price : PEGGED_PLATFORM_USD;
    } catch (cause) {
      throw ratesUnavailable(cause);
    }
  });
}

const ratesUnavailable = (cause?: unknown) =>
  new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
    message: "Couldn't load exchange rates. Please try again in a moment.",
    cause,
  });

const roundUp = (value: number, decimals: number) =>
  Math.ceil(value * 10 ** decimals) / 10 ** decimals;

/** Platform tokens worth `xlm` XLM (rounded up so the payer never under-pays). */
export async function xlmToPlatform(xlm: number): Promise<number> {
  if (xlm <= 0) return 0;
  return roundUp((xlm * (await xlmUsd())) / (await platformUsd()), 2);
}

/** XLM worth `tokens` platform tokens (rounded up to the stroop). */
export async function platformToXlm(tokens: number): Promise<number> {
  if (tokens <= 0) return 0;
  return roundUp((tokens * (await platformUsd())) / (await xlmUsd()), 7);
}

/** USD worth `tokens` platform tokens (rounded up to the cent). */
export async function platformToUsd(tokens: number): Promise<number> {
  if (tokens <= 0) return 0;
  return roundUp(tokens * (await platformUsd()), 2);
}
