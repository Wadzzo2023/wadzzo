import crypto from "node:crypto";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { AppError, ErrorCodes } from "@wadzzo/errors";

import { getBucketName, getS3Client, publicS3Url } from "./bucket";
import {
  ENTRY_FILE_TYPES,
  IMAGE_FILE_TYPES,
  MAX_ENTRY_FILE_BYTES,
  MAX_IMAGE_BYTES,
} from "./upload-rules";

/** How long a presigned upload URL stays valid. */
const UPLOAD_URL_TTL_SECONDS = 60 * 10;

/** The file a browser declared before uploading (its SHA-256 is part of the signature). */
export interface DeclaredFile {
  fileType: string;
  fileSize: number;
  checksum: string;
  fileName: string;
}

const randomKey = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

/**
 * One presigned PUT. The browser uploads straight to S3; the server only signs,
 * and the checksum pins the URL to exactly the declared file.
 */
export async function presignUpload(file: DeclaredFile) {
  const key = randomKey();
  const uploadUrl = await getSignedUrl(
    getS3Client(),
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      ContentType: file.fileType,
      ContentLength: file.fileSize,
      ChecksumSHA256: file.checksum,
    }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );
  return { uploadUrl, fileUrl: publicS3Url(key), fileName: file.fileName };
}

function assertAllowed(
  file: DeclaredFile,
  rules: { maxBytes: number; types: readonly string[]; tooLarge: string; wrongType: string },
) {
  if (file.fileSize > rules.maxBytes) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: rules.tooLarge });
  }
  if (!rules.types.includes(file.fileType)) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: rules.wrongType });
  }
}

/** Presigned upload of a bounty entry attachment. */
export async function signEntryUpload(file: DeclaredFile) {
  assertAllowed(file, {
    maxBytes: MAX_ENTRY_FILE_BYTES,
    types: ENTRY_FILE_TYPES,
    tooLarge: "File is too large",
    wrongType: "That file type can't be attached",
  });
  return presignUpload(file);
}

/** Presigned upload of a profile picture or cover image. */
export async function signImageUpload(file: DeclaredFile) {
  assertAllowed(file, {
    maxBytes: MAX_IMAGE_BYTES,
    types: IMAGE_FILE_TYPES,
    tooLarge: "Image is too large (max 10 MB)",
    wrongType: "Use a JPG, PNG, WebP or GIF image",
  });
  return presignUpload(file);
}

/**
 * Murals: one presigned PUT per keyframe under `murals/<sessionId>/`, so the
 * server knows which keys belong to which scan session and can fetch them back
 * without trusting a URL from the client.
 */
export async function signMuralFrames(sessionId: string, count: number) {
  return Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const key = `murals/${sessionId}/${index}-${randomKey(8)}.jpg`;
      const uploadUrl = await getSignedUrl(
        getS3Client(),
        new PutObjectCommand({ Bucket: getBucketName(), Key: key, ContentType: "image/jpeg" }),
        { expiresIn: UPLOAD_URL_TTL_SECONDS },
      );
      return { key, uploadUrl };
    }),
  );
}

/** Bytes of an object this app wrote (mural keyframes). */
export async function getObjectBytes(key: string): Promise<Buffer> {
  const response = await getS3Client().send(
    new GetObjectCommand({ Bucket: getBucketName(), Key: key }),
  );
  if (!response.Body) {
    throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, { message: `Empty S3 object ${key}` });
  }
  return Buffer.from(await response.Body.transformToByteArray());
}

/**
 * Upload bytes made on the server (an AI-generated image, a resized copy);
 * returns the public URL. `keyPrefix` makes derived files recognisable in the bucket.
 */
export async function uploadBufferToS3(
  body: Buffer,
  contentType: string,
  { keyPrefix = "" }: { keyPrefix?: string } = {},
): Promise<string> {
  const key = `${keyPrefix}${randomKey()}`;
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return publicS3Url(key);
}
