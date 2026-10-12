import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";

import { api } from "./client";
import type { SignedUpload } from "./types";

/**
 * ── Uploads ────────────────────────────────────────────────────────────────
 *
 * Same flow as the web (`useEntryUpload`): hash each file (hex SHA-256), ask
 * wadzzoAR for presigned PUTs, send the bytes straight to S3 with a bare
 * `Content-Type` — the signature S3 expects is exactly what wadzz0 sends.
 *
 * Hashing reads the file into memory. Fine for photos and normal phone
 * videos; very large files (hundreds of MB) may be too much for older phones.
 */

export type LocalFile = { uri: string; name: string; type: string; size: number };
export type Uploaded = { url: string; name: string; size: number; type: string };

async function sha256Hex(uri: string) {
  const buf = await new File(uri).arrayBuffer();
  // digest() takes a TypedArray; a bare ArrayBuffer fails natively
  // ("argument is not an instance of TypedArray").
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(buf));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function uploadFiles(
  files: LocalFile[],
  signPath: string,
  extraBody: Record<string, unknown> = {},
  onProgress?: (index: number, pct: number) => void,
): Promise<Uploaded[]> {
  if (!files.length) return [];
  const declared = await Promise.all(
    files.map(async (f) => ({ fileName: f.name, fileType: f.type, fileSize: f.size, checksum: await sha256Hex(f.uri) })),
  );
  const signed = await api<SignedUpload[]>(signPath, { method: "POST", body: { ...extraBody, files: declared } });

  return Promise.all(
    files.map(async (f, i) => {
      const target = signed[i]!;
      const res = await new File(f.uri).upload(target.uploadUrl, {
        httpMethod: "PUT",
        headers: { "Content-Type": f.type },
        onProgress: ({ bytesSent, totalBytes }) => {
          if (totalBytes) onProgress?.(i, Math.round((bytesSent / totalBytes) * 100));
        },
      });
      if (res.status < 200 || res.status >= 300) throw new Error(`Upload failed (${res.status})`);
      onProgress?.(i, 100);
      return { url: target.fileUrl, name: f.name, size: f.size, type: f.type };
    }),
  );
}

/** One profile image (avatar or cover) → its public URL. */
export async function uploadProfileImage(file: LocalFile, kind: "avatar" | "cover") {
  const [done] = await uploadFiles([file], "/uploads/sign", { kind });
  return done!.url;
}
