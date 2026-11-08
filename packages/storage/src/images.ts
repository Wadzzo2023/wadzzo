import sharp from "sharp";

import { AppError, ErrorCodes } from "@wadzzo/errors";

import { fetchPublicFile } from "./public-url-guard";
import { uploadBufferToS3 } from "./presign";

const OPTIMIZED_MAX_SIDE = 600;
const OPTIMIZED_JPEG_QUALITY = 60;
const CIRCLE_SIZE = 600;

/** Copy an image to the bucket as is; returns its public URL. */
export async function copyImageToBucket(sourceUrl: string): Promise<string> {
  const { bytes, contentType } = await fetchPublicFile(sourceUrl);
  if (!contentType.startsWith("image/")) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "That link isn't an image." });
  }
  return uploadBufferToS3(bytes, contentType);
}

/** A small (≤600 px, JPEG q60) copy of an image, for map pins and lists. */
export async function createOptimizedImage(sourceUrl: string): Promise<string> {
  const { bytes } = await fetchPublicFile(sourceUrl);
  const optimized = await sharp(bytes)
    .resize(OPTIMIZED_MAX_SIDE, OPTIMIZED_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: OPTIMIZED_JPEG_QUALITY })
    .toBuffer();
  return uploadBufferToS3(optimized, "image/jpeg", { keyPrefix: "optimized-" });
}

/** A 600 px round PNG crop of an image, for avatar markers. */
export async function createCircularImage(sourceUrl: string): Promise<string> {
  const { bytes } = await fetchPublicFile(sourceUrl);
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
  return uploadBufferToS3(circular, "image/png", { keyPrefix: "circular-" });
}

/**
 * A pin outline (an SVG path in a 100×100 box) drawn as a solid black shape on
 * white, as a PNG — what an AI model is shown when it redraws the outline.
 * Pass only a validated path (see `checkShapePath` in @wadzzo/schemas/pin-look).
 */
export async function renderOutlinePng(path: string, size = 1024): Promise<Buffer> {
  if (!/^[MLHVCSQTAZ0-9eE.,\s+-]+$/.test(path))
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "That outline can't be drawn" });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-6 -6 112 112"><rect x="-6" y="-6" width="112" height="112" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
