import crypto from "node:crypto";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { AppError, ErrorCodes } from "@wadzzo/errors";

import { getBucketName, getS3Client, publicS3Url } from "./bucket";

/** The upload slots the brand portal's creator tools use. */
export const uploadEndpoints = [
  "imageUploader",
  "videoUploader",
  "musicUploader",
  "blobUploader",
  "multiBlobUploader",
  "modelUploader",
  "svgUploader",
  "coverUploader",
  "profileUploader",
] as const;

export type UploadEndpoint = (typeof uploadEndpoints)[number];

const ONE_GIGABYTE = 1024 * 1024 * 1024;
const URL_TTL_SECONDS = 60 * 10;

/** Per-slot limits (every slot currently allows up to 1 GB). */
const ENDPOINT_LIMITS: Record<UploadEndpoint, { maxFileBytes: number; maxFileCount: number }> = {
  imageUploader: { maxFileBytes: ONE_GIGABYTE, maxFileCount: 1 },
  videoUploader: { maxFileBytes: ONE_GIGABYTE, maxFileCount: 1 },
  musicUploader: { maxFileBytes: ONE_GIGABYTE, maxFileCount: 1 },
  blobUploader: { maxFileBytes: ONE_GIGABYTE, maxFileCount: 1 },
  multiBlobUploader: { maxFileBytes: ONE_GIGABYTE, maxFileCount: 5 },
  modelUploader: { maxFileBytes: ONE_GIGABYTE, maxFileCount: 1 },
  svgUploader: { maxFileBytes: ONE_GIGABYTE, maxFileCount: 1 },
  coverUploader: { maxFileBytes: ONE_GIGABYTE, maxFileCount: 1 },
  profileUploader: { maxFileBytes: ONE_GIGABYTE, maxFileCount: 1 },
};

/** Everything creators may upload: images, video, audio, 3D models, documents and spreadsheets. */
const CREATOR_FILE_TYPES: ReadonlySet<string> = new Set([
  // images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  // video
  "video/mp4",
  "video/quicktime",
  "video/webm",
  // audio
  "audio/mp3",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/alac",
  "audio/aiff",
  "audio/wma",
  "audio/m4a",
  "audio/x-wav",
  "audio/x-ms-wma",
  "audio/x-aiff",
  "audio/x-flac",
  "audio/x-m4a",
  "audio/x-mp3",
  "audio/x-mpeg",
  "audio/x-ogg",
  "audio/x-aac",
  "audio/x-alac",
  // 3D models
  "application/octet-stream",
  ".obj",
  ".glb",
  // documents and spreadsheets
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/tab-separated-values",
  "application/pdf",
  "application/vnd.oasis.opendocument.spreadsheet",
]);

export interface EndpointUploadRequest {
  fileType: string;
  fileSize: number;
  checksum: string;
  endpoint: UploadEndpoint;
  fileName: string;
}

/** A presigned PUT for one of the creator-tool upload slots, after checking size and type. */
export async function signUploadForEndpoint(request: EndpointUploadRequest) {
  const { maxFileBytes } = ENDPOINT_LIMITS[request.endpoint];

  if (request.fileSize > maxFileBytes) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "File is too large" });
  }
  if (!CREATOR_FILE_TYPES.has(request.fileType)) {
    throw new AppError(ErrorCodes.AUTH_FORBIDDEN, { message: "File type not allowed" });
  }

  const key = crypto.randomBytes(32).toString("hex");
  const uploadUrl = await getSignedUrl(
    getS3Client(),
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      ContentType: request.fileType,
      ContentLength: request.fileSize,
      ChecksumSHA256: request.checksum,
    }),
    { expiresIn: URL_TTL_SECONDS },
  );
  return { uploadUrl, fileUrl: publicS3Url(key), fileName: request.fileName };
}
