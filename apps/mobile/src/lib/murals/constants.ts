/**
 * ── Murals: shared numbers and shapes ──────────────────────────────────────
 *
 * Copied from wadzzoAR `src/lib/murals/constants.ts` — keep the two in step
 * (the server enforces its own copy). Plan: wadzzoAR/docs/murals/plan.md.
 */

/** A scan matches an existing mural only inside this radius. */
export const MATCH_RADIUS_M = 75;
/** `murals.nearby` — what the camera pre-matches against. */
export const NEARBY_RADIUS_M = 150;
/** Cosine similarity (normalised MobileCLIP embeddings) for "same mural". */
export const MATCH_SIMILARITY = 0.82;
/** Embeddings kept per mural; new angles replace nothing once full. */
export const MAX_EMBEDDINGS_PER_MURAL = 12;

/** Zero-shot mural probability needed to lock on device / pass server step 3. */
export const LOCK_SCORE = 0.5;
/** Lower bar the mural must stay above during the sweep. */
export const HOLD_SCORE = 0.3;

/** Sweep: how far to turn each way from where the mural locked. */
export const SWEEP_SIDE_DEG = 12;
/** Sweep: total yaw span and duration bounds. */
export const SWEEP_MIN_SPAN_DEG = 20;
export const SWEEP_MIN_MS = 1_500;
export const SWEEP_MAX_MS = 20_000;

/** Worst GPS accuracy accepted for a scan. */
export const MAX_GPS_ACCURACY_M = 50;
/** A scan session must be submitted within this window. */
export const SESSION_TTL_MS = 3 * 60_000;

/** Keyframes: three per scan, JPEG, long edge ~1024 px. */
export const FRAME_COUNT = 3;
export const MAX_FRAME_BYTES = 1_500_000;

/** Abuse ceilings, per user (plan §5.1). */
export const MAX_SESSIONS_PER_HOUR = 30;
export const MAX_VISION_SCANS_PER_DAY = 20;

export type MuralStatus = "DISCOVERED" | "PENDING" | "APPROVED" | "REJECTED";
export type ScanPlatform = "web" | "ios" | "android";

export const REJECT_CODES = [
  "NOT_ART",
  "SCREEN",
  "WEB_COPY",
  "GPS_WEAK",
  "NO_SWEEP",
  "DAILY_LIMIT",
  "MURAL_REJECTED",
  "UNSAFE",
  "RATE_LIMIT",
  "SESSION_EXPIRED",
] as const;
export type RejectCode = (typeof REJECT_CODES)[number];

/** User-facing copy for each reject (plan §6.7). `retryable` drives the CTA. */
export const REJECT_COPY: Record<RejectCode, { message: string; retryable: boolean }> = {
  NOT_ART: { message: "That doesn't look like street art", retryable: true },
  SCREEN: { message: "Looks like a screen or photo — scan the real wall", retryable: true },
  WEB_COPY: { message: "This image matches a photo online — scan it in person", retryable: true },
  GPS_WEAK: { message: "Your location is too rough — step outside and wait a moment", retryable: true },
  NO_SWEEP: { message: "Turn the phone a bit further left and right", retryable: true },
  DAILY_LIMIT: { message: "You've hit today's limit for this mural — come back after midnight", retryable: false },
  MURAL_REJECTED: { message: "This one isn't collectable", retryable: false },
  UNSAFE: { message: "We can't accept this image", retryable: false },
  RATE_LIMIT: { message: "Too many scans — take a short break", retryable: false },
  SESSION_EXPIRED: { message: "That took too long — try the scan again", retryable: true },
};

/** What a mural looks like everywhere outside the admin. */
export type MuralCard = {
  id: string;
  title: string;
  /** True when `title` is the auto title (nobody has named it yet). */
  autoTitled: boolean;
  artist: string | null;
  coverUrl: string;
  latitude: number;
  longitude: number;
  status: MuralStatus;
  distinctScanners: number;
  confirmationsNeeded: number;
  scanCount: number;
};

/** The submit result the camera renders directly (plan §5.1). */
export type ScanResult =
  | {
      kind: "collected";
      mural: MuralCard;
      coins: number;
      balance: number;
      scansToday: number;
      dailyLimit: number;
    }
  | {
      kind: "discovered";
      mural: MuralCard;
      coins: number;
      bonus: number;
      balance: number;
      /** 1 = created it; 2..n = confirmer. */
      rank: number;
      scansToday: number;
      dailyLimit: number;
      canName: boolean;
    }
  | { kind: "rejected"; code: RejectCode; message: string; retryable: boolean };
