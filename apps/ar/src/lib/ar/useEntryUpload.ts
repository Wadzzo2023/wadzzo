import { useCallback, useState } from "react";

import { api } from "~/utils/api";

/**
 * ── Entry uploads ──────────────────────────────────────────────────────────
 *
 * Attachments for a bounty entry: hash each file, ask the server for a
 * presigned PUT per file (`bounty.uploadUrls`), then send the bytes straight
 * to S3 — the app server never carries the file.
 *
 * The hex SHA-256 and a bare `Content-Type` PUT match the marketplace's uploader
 * exactly (`pages/test.tsx`), against the same bucket and SDK version, so
 * the signature S3 expects is the one this sends.
 *
 * Uses XHR rather than fetch because fetch still can't report upload
 * progress, and on a phone a 60MB video with no progress bar reads as frozen.
 */

export type UploadedMedia = {
  url: string;
  name: string;
  size: number;
  type: string;
};

export type PendingFile = {
  key: string;
  file: File;
  progress: number;
  error?: string;
};

async function sha256Hex(file: File) {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function put(url: string, file: File, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.send(file);
  });
}

export function useEntryUpload(bountyId: number) {
  const sign = api.bounty.uploadUrls.useMutation();
  const [files, setFiles] = useState<PendingFile[]>([]);

  const patch = (key: string, p: Partial<PendingFile>) =>
    setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, ...p } : f)));

  /** Uploads every pending file; resolves with the media rows to save. */
  const uploadAll = useCallback(
    async (pending: PendingFile[]): Promise<UploadedMedia[]> => {
      if (pending.length === 0) return [];

      const declared = await Promise.all(
        pending.map(async (p) => ({
          fileName: p.file.name,
          fileType: p.file.type,
          fileSize: p.file.size,
          checksum: await sha256Hex(p.file),
        })),
      );
      const signed = await sign.mutateAsync({ bountyId, files: declared });

      return Promise.all(
        pending.map(async (p, i) => {
          const target = signed[i]!;
          try {
            await put(target.uploadUrl, p.file, (pct) => patch(p.key, { progress: pct }));
          } catch (e) {
            patch(p.key, {
              error: e instanceof Error ? e.message : "Upload failed",
            });
            throw e;
          }
          patch(p.key, { progress: 100 });
          return {
            url: target.fileUrl,
            name: p.file.name,
            size: p.file.size,
            type: p.file.type,
          };
        }),
      );
    },
    [bountyId, sign],
  );

  const add = useCallback(
    (list: FileList | File[]) =>
      setFiles((fs) => [
        ...fs,
        ...Array.from(list).map((file) => ({
          key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
          file,
          progress: 0,
        })),
      ]),
    [],
  );
  const remove = useCallback(
    (key: string) => setFiles((fs) => fs.filter((f) => f.key !== key)),
    [],
  );
  const reset = useCallback(() => setFiles([]), []);

  return { files, add, remove, reset, uploadAll };
}
