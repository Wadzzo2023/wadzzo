import type { CoinReason, Mural, MuralSettings, Prisma, PrismaClient } from "@prisma/client";

import type { MuralCard } from "~/lib/murals/constants";

/**
 * ── Murals: settings, serialisation, coins ─────────────────────────────────
 *
 * Small pieces the scan pipeline and the read endpoints share.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** The single settings row; created with the schema defaults on first use. */
export function getMuralSettings(db: Db): Promise<MuralSettings> {
  return db.muralSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export function toMuralCard(m: Mural, settings: Pick<MuralSettings, "confirmationsNeeded">): MuralCard {
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
  entry: { userId: string; amount: number; reason: CoinReason; muralId?: string; scanId?: string; note?: string },
): Promise<number> {
  await tx.coinLedger.create({ data: entry });
  const { balance } = await tx.coinBalance.upsert({
    where: { userId: entry.userId },
    update: { balance: { increment: entry.amount } },
    create: { userId: entry.userId, balance: entry.amount },
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
  return { latitude: { gte: lat - dLat, lte: lat + dLat }, longitude: { gte: lng - dLng, lte: lng + dLng } };
}
