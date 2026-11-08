// Browser-side image helpers for Pin Studio: reading pixels to trace, and shrinking
// a picked file so it fits in a request.

export const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif|svg\+xml)$/;
/** The biggest file the studio takes from a brand. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** The API accepts about 1 MB per request, so a reference photo stays under this. */
const REFERENCE_MAX_CHARS = 900_000;

/** An image → its pixels at `size`×`size` (contained), for tracing. */
export async function imagePixels(src: string, size = 160) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const k = Math.min(size / img.naturalWidth, size / img.naturalHeight) || 1;
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return ctx.getImageData(0, 0, size, size);
}

/** A picked file → a PNG data URL no bigger than `max` px (for tracing; it never leaves the browser). */
export async function fileToDataUrl(file: File, max = 1024) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * A reference photo for the AI, shrunk to a JPEG (transparent parts become white)
 * small enough to send. Returns null if it can't be made small enough.
 */
export async function fileToReferenceDataUrl(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    for (const side of [1024, 768, 512]) {
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7, 0.55]) {
        const out = canvas.toDataURL("image/jpeg", quality);
        if (out.length <= REFERENCE_MAX_CHARS) return out;
      }
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
