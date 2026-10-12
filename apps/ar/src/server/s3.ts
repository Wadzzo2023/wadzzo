import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

import { env } from "~/env";
import { ENTRY_FILE_TYPES, MAX_ENTRY_FILE_BYTES } from "~/lib/ar/entryFiles";

export { MAX_ENTRY_FILE_BYTES, MAX_ENTRY_FILES } from "~/lib/ar/entryFiles";

/**
 * ── S3 uploads ─────────────────────────────────────────────────────────────
 *
 * Presigned PUTs into the same bucket the main webapp writes to, so a file a
 * fan attaches here is the same URL a brand opens from wadzz0's submission
 * review. Ported from wadzz0's `src/server/s3.ts`, cut down to the one thing
 * this app uploads: bounty entry attachments.
 *
 * The browser PUTs the bytes straight to S3; this server only signs. The
 * SHA-256 checksum is part of the signature, so the URL can't be reused to
 * upload anything other than the exact file that was declared.
 */

const s3Client = new S3Client({
  region: env.AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

const EXPIRES_IN_SECONDS = 60 * 10;

export function publicS3Url(key: string) {
  return `https://${env.AWS_BUCKET_NAME}.s3.amazonaws.com/${key}`;
}

/** True for a URL this bucket actually serves — used to reject foreign links. */
export function isOwnS3Url(url: string) {
  return url.startsWith(publicS3Url(""));
}

export async function signEntryUpload({
  fileType,
  fileSize,
  checksum,
  fileName,
}: {
  fileType: string;
  fileSize: number;
  checksum: string;
  fileName: string;
}) {
  if (fileSize > MAX_ENTRY_FILE_BYTES) throw new Error("File is too large");
  if (!(ENTRY_FILE_TYPES as readonly string[]).includes(fileType)) {
    throw new Error("That file type can't be attached");
  }

  const key = crypto.randomBytes(32).toString("hex");
  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: env.AWS_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
      ContentLength: fileSize,
      ChecksumSHA256: checksum,
    }),
    { expiresIn: EXPIRES_IN_SECONDS },
  );

  return { uploadUrl, fileUrl: publicS3Url(key), fileName };
}

/**
 * Murals: one presigned PUT per keyframe, under `murals/<sessionId>/`, so the
 * server knows exactly which keys belong to which scan session and can fetch
 * them back without trusting a URL from the client. The byte size isn't
 * known up front, so the size cap is checked when the server reads them back.
 */
export async function signMuralFrames(sessionId: string, count: number) {
  return Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const key = `murals/${sessionId}/${i}-${crypto.randomBytes(8).toString("hex")}.jpg`;
      const uploadUrl = await getSignedUrl(
        s3Client,
        new PutObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key, ContentType: "image/jpeg" }),
        { expiresIn: EXPIRES_IN_SECONDS },
      );
      return { key, uploadUrl };
    }),
  );
}

/** Bytes of an object this app wrote (mural keyframes). */
export async function getObjectBytes(key: string) {
  const res = await s3Client.send(new GetObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key }));
  if (!res.Body) throw new Error(`Empty S3 object ${key}`);
  return Buffer.from(await res.Body.transformToByteArray());
}
