import { AppError, ErrorCodes } from "@wadzzo/errors";

import { presignUpload, type DeclaredFile } from "./presign";
import { CREATOR_FILE_TYPES, MAX_CREATOR_FILE_BYTES } from "./upload-rules";

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

/**
 * A presigned PUT for a creator-tool upload, after checking size and type.
 * Extra fields the browser sent (like which slot it came from) are ignored.
 */
export async function signCreatorUpload(file: DeclaredFile) {
  if (file.fileSize > MAX_CREATOR_FILE_BYTES) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "File is too large" });
  }
  if (!CREATOR_FILE_TYPES.includes(file.fileType)) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "File type not allowed" });
  }
  const { fileType, fileSize, checksum, fileName } = file;
  return presignUpload({ fileType, fileSize, checksum, fileName });
}
