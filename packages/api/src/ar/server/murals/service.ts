import type { CoinReason, Mural, MuralSettings, Prisma } from "@wadzzo/db";
import type { Db as AppDb } from "@wadzzo/db";

import type { MuralCard } from "@wadzzo/ar-core/murals/constants";

/**
 * ── Murals: settings, serialisation, coins ─────────────────────────────────
 *
 * Small pieces the scan pipeline and the read endpoints share.
 */

type Db = AppDb | Prisma.TransactionClient;

/** The single settings row; created with the schema defaults on first use. */
export function getMuralSettings(db: Db): Promise<MuralSettings> {
  return db.muralSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

export function toMuralCard(
  m: Mural,
  settings: Pick<MuralSettings, "confirmationsNeeded">,
): MuralCard {
  return {
    id: m.id,
    title: m.title ?? m.autoTitle,
    autoTitled: !m.title,
    artist: m.artist,
    coverUrl: m.coverUrl,
    latitude: m.latitude,
    longitude: m.longitude,
    status: m.status,
    distinctScanners: m.distinctScanners,
    confirmationsNeeded: settings.confirmationsNeeded,
    scanCount: m.scanCount,
  };
}

/**
 * Adds a ledger row and moves the cached balance in the same transaction.
 * Returns the new balance.
 */
export async function creditCoins(
  tx: Prisma.TransactionClient,
  /** platformId: the platform (site) the coins were earned on; each has its own balance */
  entry: {
    userId: string;
    amount: number;
    reason: CoinReason;
    platformId: string;
    muralId?: string;
    scanId?: string;
    note?: string;
  },
): Promise<number> {
  const { platformId, ...fields } = entry;
  await tx.coinLedger.create({ data: { ...fields, platformId } });
  const { balance } = await tx.coinBalance.upsert({
    where: { userId_platformId: { userId: entry.userId, platformId } },
    update: { balance: { increment: entry.amount } },
    create: { userId: entry.userId, platformId, balance: entry.amount },
  });
  return balance;
}

/** Murals that may be shown or collected: never rejected or merged away. */
export const LIVE_MURAL: Prisma.MuralWhereInput = {
  status: { not: "REJECTED" },
  mergedIntoId: null,
};

/** Rough lat/lng box around a point, for an indexed pre-filter before haversine. */
export function boxAround(lat: number, lng: number, radiusM: number) {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return {
    latitude: { gte: lat - dLat, lte: lat + dLat },
    longitude: { gte: lng - dLng, lte: lng + dLng },
  };
}
