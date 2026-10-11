import type { Mural, Prisma } from "@prisma/client";
import type { Db } from "~/server/db";
import { TRPCError } from "@trpc/server";

import { distanceMeters } from "~/lib/ar/geo";
import {
  FRAME_COUNT,
  LOCK_SCORE,
  MATCH_RADIUS_M,
  MATCH_SIMILARITY,
  MAX_EMBEDDINGS_PER_MURAL,
  MAX_FRAME_BYTES,
  MAX_GPS_ACCURACY_M,
  MAX_SESSIONS_PER_HOUR,
  MAX_VISION_SCANS_PER_DAY,
  REJECT_COPY,
  SESSION_TTL_MS,
  SWEEP_MAX_MS,
  SWEEP_MIN_MS,
  SWEEP_MIN_SPAN_DEG,
  type RejectCode,
  type ScanPlatform,
  type ScanResult,
} from "~/lib/murals/constants";
import { getCurrentPlatform, platformScope } from "~/server/platform";
import { getObjectBytes, publicS3Url, signMuralFrames } from "~/server/s3";

import { dot, embedImage, muralScore } from "./clip";
import { autoTitleFor, localDay, timeZoneAt } from "./geo";
import { boxAround, creditCoins, getMuralSettings, toMuralCard } from "./service";
import { checkWithVision } from "./vision";

/**
 * ── Mural scan pipeline ────────────────────────────────────────────────────
 *
 * Two calls per scan:
 *
 *   startScan   → a session + three presigned keyframe uploads
 *   submitScan  → the checks in plan §3.3, cheapest first, then one
 *                 transaction that writes the scan, coins and status
 *
 * Every attempt is recorded on MuralScanSession with its outcome and the
 * Cloud Vision units it cost, accepted or not.
 */


/** A later fix may drift from the start fix by at most this much. */
const MAX_DRIFT_M = 100;
/** A new keyframe embedding is only kept if it's a genuinely new angle. */
const NEW_ANGLE_BELOW = 0.95;

const reject = (code: RejectCode): Extract<ScanResult, { kind: "rejected" }> => ({
  kind: "rejected",
  code,
  ...REJECT_COPY[code],
});

// ── start ───────────────────────────────────────────────────────────────────

export type StartScanInput = { lat: number; lng: number; accuracy: number };

export async function startScan(db: Db, userId: string, input: StartScanInput) {
  const hourAgo = new Date(Date.now() - 60 * 60_000);
  const recent = await db.muralScanSession.count({ where: { userId, startedAt: { gte: hourAgo } } });
  if (recent >= MAX_SESSIONS_PER_HOUR) return { ok: false as const, ...reject("RATE_LIMIT") };
  if (input.accuracy > MAX_GPS_ACCURACY_M) return { ok: false as const, ...reject("GPS_WEAK") };

  const session = await db.muralScanSession.create({
    data: { userId, latitude: input.lat, longitude: input.lng, accuracyM: input.accuracy, frameKeys: [] },
  });
  const frames = await signMuralFrames(session.id, FRAME_COUNT);
  await db.muralScanSession.update({ where: { id: session.id }, data: { frameKeys: frames.map((f) => f.key) } });

  const settings = await getMuralSettings(db);
  return {
    ok: true as const,
    sessionId: session.id,
    /** Upload order: left, centre, right. */
    frames: frames.map((f) => ({ uploadUrl: f.uploadUrl })),
    expiresAt: new Date(session.startedAt.getTime() + SESSION_TTL_MS),
    limits: {
      coinsPerScan: settings.coinsPerScan,
      discoveryBonus: settings.discoveryBonus,
      dailyScansPerMural: settings.dailyScansPerMural,
    },
  };
}

// ── submit ──────────────────────────────────────────────────────────────────

export type SubmitScanInput = {
  sessionId: string;
  lat: number;
  lng: number;
  accuracy: number;
  /** Mobile only: the OS flagged the fix as simulated. */
  mock?: boolean;
  sweep: { spanDeg: number; durationMs: number };
  platform: ScanPlatform;
};

type Candidate = Mural & { embeddings: { vector: number[] }[] };

/** Best match among this platform's live-or-rejected murals within MATCH_RADIUS_M (every platform's on Wadzzo). */
async function findMatch(db: Db | Prisma.TransactionClient, lat: number, lng: number, vectors: number[][]) {
  const platform = await getCurrentPlatform();
  const candidates: Candidate[] = await db.mural.findMany({
    where: { mergedIntoId: null, ...platformScope({ platform }), ...boxAround(lat, lng, MATCH_RADIUS_M) },
    include: { embeddings: { select: { vector: true } } },
  });
  let best: { mural: Candidate; similarity: number } | null = null;
  for (const m of candidates) {
    if (distanceMeters({ lat, lng }, { lat: m.latitude, lng: m.longitude }) > MATCH_RADIUS_M) continue;
    for (const e of m.embeddings) {
      for (const v of vectors) {
        const similarity = dot(e.vector, v);
        if (!best || similarity > best.similarity) best = { mural: m, similarity };
      }
    }
  }
  return best && best.similarity >= MATCH_SIMILARITY ? best : null;
}

export async function submitScan(db: Db, userId: string, input: SubmitScanInput): Promise<ScanResult> {
  const session = await db.muralScanSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.userId !== userId) throw new TRPCError({ code: "NOT_FOUND", message: "Unknown scan" });
  if (session.finishedAt) throw new TRPCError({ code: "CONFLICT", message: "This scan was already submitted" });

  let costUnits = 0;
  const finish = async (result: ScanResult, scanId?: string) => {
    await db.muralScanSession.update({
      where: { id: session.id },
      data: {
        finishedAt: new Date(),
        outcome: result.kind === "rejected" ? result.code : "accepted",
        costUnits,
        scanId,
      },
    });
    return result;
  };

  // ── 1. session, GPS ────────────────────────────────────────────────────
  if (Date.now() - session.startedAt.getTime() > SESSION_TTL_MS) return finish(reject("SESSION_EXPIRED"));
  if (input.mock) return finish(reject("GPS_WEAK"));
  if (input.accuracy > MAX_GPS_ACCURACY_M) return finish(reject("GPS_WEAK"));
  const drift = distanceMeters({ lat: input.lat, lng: input.lng }, { lat: session.latitude, lng: session.longitude });
  if (drift > MAX_DRIFT_M) return finish(reject("GPS_WEAK"));

  // ── 2. sweep ───────────────────────────────────────────────────────────
  const { spanDeg, durationMs } = input.sweep;
  if (spanDeg < SWEEP_MIN_SPAN_DEG || durationMs < SWEEP_MIN_MS || durationMs > SWEEP_MAX_MS) {
    return finish(reject("NO_SWEEP"));
  }

  // ── 3. keyframes → embeddings (server-side, never the client's) ─────────
  if (session.frameKeys.length !== FRAME_COUNT) throw new TRPCError({ code: "BAD_REQUEST", message: "Scan has no frames" });
  const frames = await Promise.all(
    session.frameKeys.map(async (key) => {
      const bytes = await getObjectBytes(key).catch(() => null);
      if (!bytes || bytes.length > MAX_FRAME_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Keyframes are missing or not JPEGs" });
      }
      return bytes;
    }),
  );
  const vectors = await Promise.all(frames.map(embedImage));
  const scores = vectors.map((v) => muralScore(v));
  const centreScore = scores[1]!.score;
  if (Math.max(...scores.map((s) => s.score)) < LOCK_SCORE) return finish(reject("NOT_ART"));

  // ── 4–5. match, rejected mural, daily limit, vision budget ─────────────
  const timeZone = timeZoneAt(input.lat, input.lng);
  const today = localDay(timeZone);
  const settings = await getMuralSettings(db);

  const pre = await findMatch(db, input.lat, input.lng, vectors);
  if (pre?.mural.status === "REJECTED") return finish(reject("MURAL_REJECTED"));
  if (pre) {
    const todays = await db.muralScan.count({ where: { userId, muralId: pre.mural.id, localDay: today } });
    if (todays >= settings.dailyScansPerMural) return finish(reject("DAILY_LIMIT"));
  }
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
  const visionToday = await db.muralScanSession.count({
    where: { userId, startedAt: { gte: dayAgo }, costUnits: { gt: 0 } },
  });
  if (visionToday >= MAX_VISION_SCANS_PER_DAY) return finish(reject("RATE_LIMIT"));

  // ── 6–7. Cloud Vision ──────────────────────────────────────────────────
  const vision = await checkWithVision(frames, centreScore);
  costUnits = vision.report.units;
  if (!vision.ok) return finish(reject(vision.code));

  // ── 8. write ───────────────────────────────────────────────────────────
  const keyframes = session.frameKeys.map(publicS3Url);
  const autoTitle = pre ? null : await autoTitleFor(input.lat, input.lng);
  const visionJson = {
    ...vision.report,
    clip: scores,
    match: pre ? { muralId: pre.mural.id, similarity: pre.similarity } : null,
  } as unknown as Prisma.InputJsonValue;

  const result = await db.$transaction(async (tx) => {
    // Serialise discoveries in the same ~110 m cell so two people finding
    // the same wall at once don't create twins.
    const cell = `mural:${Math.round(input.lat * 1000)}:${Math.round(input.lng * 1000)}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cell}))`;

    const match = pre ?? (await findMatch(tx, input.lat, input.lng, vectors));
    let mural: Mural =
      match?.mural ??
      (await tx.mural.create({
        data: {
          autoTitle: autoTitle ?? "Street art",
          latitude: input.lat,
          longitude: input.lng,
          coverUrl: keyframes[1]!,
          discovererId: userId,
          platformId: (await getCurrentPlatform()).id,
        },
      }));
    await tx.$executeRaw`SELECT id FROM "Mural" WHERE id = ${mural.id} FOR UPDATE`;
    mural = await tx.mural.findUniqueOrThrow({ where: { id: mural.id } });
    if (mural.status === "REJECTED") return reject("MURAL_REJECTED");

    // Re-count under the lock: two submissions racing for the last slot.
    const todays = await tx.muralScan.count({ where: { userId, muralId: mural.id, localDay: today } });
    if (todays >= settings.dailyScansPerMural) return reject("DAILY_LIMIT");

    const isNewScanner = (await tx.muralScan.count({ where: { userId, muralId: mural.id } })) === 0;
    const distinctScanners = mural.distinctScanners + (isNewScanner ? 1 : 0);
    const rank = isNewScanner && distinctScanners <= settings.confirmationsNeeded ? distinctScanners : null;
    const bonus = rank ? settings.discoveryBonus : 0;

    const scan = await tx.muralScan.create({
      data: {
        muralId: mural.id,
        userId,
        latitude: input.lat,
        longitude: input.lng,
        accuracyM: input.accuracy,
        timeZone,
        localDay: today,
        keyframes,
        vision: visionJson,
        platform: input.platform,
        discoveryRank: rank,
        coinsAwarded: settings.coinsPerScan + bonus,
      },
    });

    mural = await tx.mural.update({
      where: { id: mural.id },
      data: {
        scanCount: { increment: 1 },
        distinctScanners,
        // Enough distinct people have seen it → into the admin queue.
        ...(mural.status === "DISCOVERED" && distinctScanners >= settings.confirmationsNeeded ? { status: "PENDING" } : {}),
      },
    });

    // coins land in the balance of the site they were earned on
    const earnedOn = (await getCurrentPlatform()).id;
    let balance = await creditCoins(tx, {
      userId,
      amount: settings.coinsPerScan,
      reason: "MURAL_SCAN",
      muralId: mural.id,
      scanId: scan.id,
      platformId: earnedOn,
    });
    if (bonus) {
      balance = await creditCoins(tx, {
        userId,
        amount: bonus,
        reason: "MURAL_DISCOVERY",
        muralId: mural.id,
        scanId: scan.id,
        platformId: earnedOn,
        note: `Discoverer #${rank}`,
      });
    }

    // Keep the centre frame as a reference if it's a new angle on this mural.
    const known = await tx.muralEmbedding.findMany({ where: { muralId: mural.id }, select: { vector: true } });
    const centre = vectors[1]!;
    if (known.length < MAX_EMBEDDINGS_PER_MURAL && known.every((e) => dot(e.vector, centre) < NEW_ANGLE_BELOW)) {
      await tx.muralEmbedding.create({ data: { muralId: mural.id, vector: centre, scanId: scan.id } });
    }

    const card = toMuralCard(mural, settings);
    const scansToday = todays + 1;
    const common = { mural: card, coins: settings.coinsPerScan, balance, scansToday, dailyLimit: settings.dailyScansPerMural };
    const out: ScanResult = rank
      ? { kind: "discovered", ...common, bonus, rank, canName: !mural.title }
      : { kind: "collected", ...common };
    return Object.assign(out, { scanId: scan.id });
  }, { timeout: 15_000 });

  const { scanId, ...rest } = result as ScanResult & { scanId?: string };
  return finish(rest as ScanResult, scanId);
}

// ── naming ──────────────────────────────────────────────────────────────────

/** Any of the first `confirmationsNeeded` scanners may name it; first one wins. */
export async function nameMural(db: Db, userId: string, input: { muralId: string; title: string; artist?: string }) {
  const ranked = await db.muralScan.findFirst({
    where: { muralId: input.muralId, userId, discoveryRank: { not: null } },
    select: { id: true },
  });
  if (!ranked) throw new TRPCError({ code: "FORBIDDEN", message: "Only the first finders can name this mural" });

  const { count } = await db.mural.updateMany({
    where: { id: input.muralId, title: null, status: { not: "REJECTED" } },
    data: { title: input.title, artist: input.artist ? input.artist : null, namedById: userId },
  });
  const mural = await db.mural.findUniqueOrThrow({ where: { id: input.muralId } });
  return { named: count === 1, title: mural.title, artist: mural.artist, namedById: mural.namedById };
}
