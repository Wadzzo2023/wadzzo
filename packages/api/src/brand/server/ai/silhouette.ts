// AI pin silhouettes for Pin Studio: a description, and optionally a reference image or link,
// in; one black silhouette image out. The browser traces it into an editable outline, so the
// image itself is never stored.

import { toFile } from "openai";

import { AppError, ErrorCodes } from "@wadzzo/errors";
import { fetchPublicFile, renderOutlinePng } from "@wadzzo/storage";

import { IMAGE_MODEL, openai } from "./openai";

/** Images the model takes as a reference. */
const REFERENCE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
type RefType = (typeof REFERENCE_TYPES)[number];
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;

const refuse = (message: string) => new AppError(ErrorCodes.VALIDATION_FAILED, { message });

const asRefType = (contentType: string): RefType | null => {
  const t = contentType.split(";")[0]!.trim().toLowerCase();
  return (REFERENCE_TYPES as readonly string[]).includes(t) ? (t as RefType) : null;
};

/** `data:image/png;base64,…` from the browser → bytes and type. */
export function decodeDataUrl(dataUrl: string): { bytes: Buffer; type: RefType } {
  const m = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  const type = m ? asRefType(m[1]!) : null;
  if (!m || !type) throw refuse("The reference image must be a PNG, JPG or WebP");
  const bytes = Buffer.from(m[2]!, "base64");
  if (bytes.length > MAX_REFERENCE_BYTES) throw refuse("The reference image is over 8 MB");
  return { bytes, type };
}

/** The preview image a web page declares (Open Graph / Twitter card), resolved against the page. */
export function pagePreviewImage(html: string, pageUrl: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const key of ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) {
    for (const tag of tags) {
      const name = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
      const content = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
      if (name === key && content) {
        try {
          return new URL(content.replace(/&amp;/g, "&"), pageUrl).toString();
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * A reference link → image bytes. An image link is used as it is; a web page
 * is used through its preview image. Fetched only through the public-URL guard
 * (no private addresses, size-capped, redirects checked).
 */
export async function fetchReference(url: string): Promise<{ bytes: Buffer; type: RefType }> {
  let file: { bytes: Buffer; contentType: string };
  try {
    file = await fetchPublicFile(url, { maxBytes: MAX_REFERENCE_BYTES });
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw refuse("That link couldn't be opened");
  }
  const direct = asRefType(file.contentType);
  if (direct) return { bytes: file.bytes, type: direct };
  if (file.contentType.toLowerCase().includes("text/html")) {
    const preview = pagePreviewImage(file.bytes.toString("utf8"), url);
    if (preview) {
      const img = await fetchPublicFile(preview, { maxBytes: MAX_REFERENCE_BYTES }).catch(
        () => null,
      );
      const type = img ? asRefType(img.contentType) : null;
      if (img && type) return { bytes: img.bytes, type };
    }
    throw refuse("That page has no preview image to use — link to an image instead");
  }
  throw refuse("That link isn't an image (PNG, JPG or WebP) or a web page");
}

/** What the model is asked for: one filled shape a pin can use, never a copy of someone's work. */
export function silhouettePrompt(description: string, hasReference: boolean) {
  return [
    `A pin icon silhouette: ${description.trim()}.`,
    hasReference
      ? "Base the silhouette on the overall shape of the reference image."
      : "An original design, not a copy of any existing character, mascot, logo or artwork.",
    "Draw it as ONE solid black filled shape on a plain white background, centred and filling most of the square.",
    "One connected outline. No holes, no inner lines or details, no text, no shadows, no gradients, no border.",
  ].join(" ");
}

/**
 * What the model is asked when it redraws a brand's own outline (Pin Studio's
 * "Enhance with AI"): the same subject, cleaned up, evened out and polished,
 * plus the brand's own instruction if it gave one.
 */
export function enhancePrompt(instruction?: string) {
  const extra = instruction?.trim();
  return [
    "The image is a rough pin icon silhouette someone drew by hand.",
    "Redraw it as a clean, polished, professional icon silhouette of the same subject:",
    "keep its pose and overall proportions, smooth out wobbly or uneven edges and curves,",
    "and make the left and right sides match wherever the drawing looks meant to be symmetrical.",
    extra ? `Also: ${extra}.` : "",
    "Draw it as ONE solid black filled shape on a plain white background, centred and filling most of the square.",
    "One connected outline. No holes, no inner lines or details, no text, no shadows, no gradients, no border.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Image edit with the given pictures; returns the base64 PNG (OpenAI errors are left to withAiQuota). */
async function editImages(prompt: string, references: { bytes: Buffer; type: RefType }[]) {
  const images = await Promise.all(
    references.map((r, i) =>
      toFile(r.bytes, `reference-${i}.${r.type.split("/")[1]}`, { type: r.type }),
    ),
  );
  const res = await openai.images.edit({
    model: IMAGE_MODEL,
    image: images,
    prompt,
    size: "1024x1024",
    quality: "low",
    n: 1,
  });
  return res.data?.[0]?.b64_json;
}

const asDataUrl = (b64: string | undefined) => {
  if (!b64)
    throw new AppError(ErrorCodes.AI_GENERATION_FAILED, {
      message: "No image came back. Try again.",
    });
  return `data:image/png;base64,${b64}`;
};

/** A brand's outline (a validated path), redrawn by the AI; returns a PNG data URL. */
export async function enhanceSilhouette(path: string, instruction?: string): Promise<string> {
  const drawing = await renderOutlinePng(path);
  return asDataUrl(
    await editImages(enhancePrompt(instruction), [{ bytes: drawing, type: "image/png" }]),
  );
}

/** One silhouette image (PNG data URL) for the description and references. */
export async function generateSilhouette(
  description: string,
  references: { bytes: Buffer; type: RefType }[],
): Promise<string> {
  const prompt = silhouettePrompt(description, references.length > 0);
  // OpenAI errors are left to withAiQuota, which turns them into friendly messages.
  let b64: string | undefined;
  if (references.length) {
    b64 = await editImages(prompt, references);
  } else {
    const res = await openai.images.generate({
      model: IMAGE_MODEL,
      prompt,
      size: "1024x1024",
      quality: "low",
      n: 1,
    });
    b64 = res.data?.[0]?.b64_json;
  }
  return asDataUrl(b64);
}
