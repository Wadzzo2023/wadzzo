/**
 * What may be uploaded, shared by the servers that sign uploads and the
 * browsers that check a file before hashing and sending it. No server imports,
 * so client components can use it.
 */

/** A bounty entry: up to this many files … */
export const MAX_ENTRY_FILES = 5;
/** … of at most 1 GB each. */
export const MAX_ENTRY_FILE_BYTES = 1024 * 1024 * 1024;

/** What a fan can attach from a camera roll (creator tooling types are not included). */
export const ENTRY_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/ogg",
  "audio/aac",
  "application/pdf",
  "text/plain",
] as const;

/** What a creator may upload through the brand tools: any slot, up to 1 GB. */
export const MAX_CREATOR_FILE_BYTES = 1024 * 1024 * 1024;

/** Everything creators may upload: images, video, audio, 3D models, documents and spreadsheets. */
export const CREATOR_FILE_TYPES: readonly string[] = [
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
  // 3D models (browsers send octet-stream for .obj / .glb)
  "application/octet-stream",
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
];

/** A profile picture or cover image. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

const isIn = (list: readonly string[], value: string) => list.includes(value);

/** Why a bounty-entry file can't be attached, or `null` when it can. */
export function entryFileProblem(file: Pick<File, "type" | "size">): string | null {
  if (!isIn(ENTRY_FILE_TYPES, file.type)) return "This file type can't be attached";
  if (file.size > MAX_ENTRY_FILE_BYTES) return "Over the 1 GB limit";
  return null;
}

/** Why an image can't be used, or `null` when it can. */
export function imageFileProblem(file: Pick<File, "type" | "size">): string | null {
  if (!isIn(IMAGE_FILE_TYPES, file.type)) return "Use a JPG, PNG, WebP or GIF image";
  if (file.size > MAX_IMAGE_BYTES) return "Over the 10 MB limit";
  return null;
}
