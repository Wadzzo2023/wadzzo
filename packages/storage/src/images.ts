import crypto from "node:crypto";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

import { AppError, ErrorCodes } from "@wadzzo/errors";

import { getBucketName, getS3Client, publicS3Url } from "./bucket";

const FETCH_TIMEOUT_MS = 15_000;
const OPTIMIZED_MAX_SIDE = 600;
const OPTIMIZED_JPEG_QUALITY = 60;
const CIRCLE_SIZE = 600;

const randomName = () => crypto.randomBytes(32).toString("hex");

async function downloadImage(sourceUrl: string): Promise<{ bytes: Buffer; contentType: string }> {
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
      message: `Failed to fetch image from ${sourceUrl}`,
      details: { status: response.status },
    });
  }
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "image/jpeg",
  };
}

async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  await getS3Client().send(
    new PutObjectCommand({ Bucket: getBucketName(), Key: key, Body: body, ContentType: contentType }),
  );
  return publicS3Url(key);
}

/** Copy an image to the bucket as is; returns its public URL. */
export async function copyImageToBucket(sourceUrl: string): Promise<string> {
  const { bytes, contentType } = await downloadImage(sourceUrl);
  return putObject(randomName(), bytes, contentType);
}

/** A small (≤600 px, JPEG q60) copy of an image, for map pins and lists. */
export async function createOptimizedImage(sourceUrl: string): Promise<string> {
  const { bytes } = await downloadImage(sourceUrl);
  const optimized = await sharp(bytes)
    .resize(OPTIMIZED_MAX_SIDE, OPTIMIZED_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: OPTIMIZED_JPEG_QUALITY })
    .toBuffer();
  return putObject(`optimized-${randomName()}`, optimized, "image/jpeg");
}

/** A 600 px round PNG crop of an image, for avatar markers. */
export async function createCircularImage(sourceUrl: string): Promise<string> {
  const { bytes } = await downloadImage(sourceUrl);
  const mask = Buffer.from(
    `<svg width="${CIRCLE_SIZE}" height="${CIRCLE_SIZE}"><circle cx="${CIRCLE_SIZE / 2}" cy="${CIRCLE_SIZE / 2}" r="${CIRCLE_SIZE / 2}" fill="white"/></svg>`,
  );
  const circular = await sharp(bytes)
    .resize(CIRCLE_SIZE, CIRCLE_SIZE, { fit: "cover", position: "center" })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  return putObject(`circular-${randomName()}`, circular, "image/png");
}
