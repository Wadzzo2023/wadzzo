import { createDecipheriv } from "crypto";

import { Keypair } from "@stellar/stellar-sdk";

import { env } from "../../../env";
import type { Db } from "@wadzzo/db";
import { AppError, ErrorCodes } from "@wadzzo/errors";

/**
 * Secrets the server signs with. Issuer secrets are stored encrypted
 * (AES-256-GCM, "v1:<iv>:<tag>:<ciphertext>" in base64) by the fan app and the
 * brand portal; this app only ever decrypts them, for the moment a copy is
 * minted. The key is optional here: without it only stock can be claimed.
 */
function key() {
  const raw = env.ISSUER_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: "ISSUER_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)",
    });
  return buf;
}

export function decryptSecret(payload: string) {
  const k = key();
  if (!k)
    throw new AppError(ErrorCodes.CONFIG_MISSING, {
      message: "ISSUER_ENCRYPTION_KEY is not set",
    });
  const [v, iv, tag, data] = payload.split(":");
  if (v !== "v1" || !iv || !tag || !data)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: "Unknown secret format",
    });
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString(
    "utf8",
  );
}

export const motherKeypair = () => Keypair.fromSecret(env.MOTHER_SECRET);
/** The platform's own storage (admin items). */
export const platformStorageKeypair = () => Keypair.fromSecret(env.STORAGE_SECRET);

/**
 * The keypair that can mint an asset: the creator's CreatorIssuer for new
 * assets, or the legacy per-asset issuer secret. Null when nobody can mint
 * more (no encryption key here, or a legacy asset without a stored secret).
 */
export async function issuerKeypairFor(
  db: Db,
  asset: { id: number; issuer: string; creatorId: string | null },
) {
  if (asset.creatorId && key()) {
    const ci = await db.creatorIssuer.findUnique({
      where: { creatorId: asset.creatorId },
    });
    if (ci?.publicKey === asset.issuer)
      return Keypair.fromSecret(decryptSecret(ci.secretEncrypted));
  }
  const legacy = await db.asset.findUnique({
    where: { id: asset.id },
    select: { issuerPrivate: true },
  });
  if (legacy?.issuerPrivate) {
    const kp = Keypair.fromSecret(legacy.issuerPrivate);
    if (kp.publicKey() === asset.issuer) return kp;
  }
  return null;
}

/** A creator's storage keypair (the account that holds their stock). */
export async function storageKeypairFor(db: Db, creatorId: string) {
  const c = await db.creator.findUnique({
    where: { id: creatorId },
    select: { storageSecret: true },
  });
  return c?.storageSecret ? Keypair.fromSecret(c.storageSecret) : null;
}
