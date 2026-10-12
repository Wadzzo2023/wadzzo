// src/lib/google-place-enrichment.ts
import { copyImageToBucket } from "@wadzzo/storage";
import { env } from "./env";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlaceEnrichment {
  imageUrl: string | null;
}

// ─── Google Places helpers ────────────────────────────────────────────────────

/**
 * Fetch the first photo reference and website URL for a place.
 * Uses the Places Details API (v1 field mask).
 */
async function fetchGooglePlaceDetails(gPlaceId: string): Promise<{
  photoName: string | null;
}> {
  const apiKey = env.GOOGLE_MAP_API_KEY; // add this to your env

  const url =
    `https://places.googleapis.com/v1/places/${encodeURIComponent(gPlaceId)}` +
    `?fields=photos&key=${apiKey}`;

  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Google Places API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    photos?: { name: string }[];
  };

  return {
    photoName: data.photos?.[0]?.name ?? null,
  };
}

/**
 * Build a photo media URL from a Places photo resource name.
 * Returns a fetchable HTTPS URL for the full-resolution image.
 */
function buildPlacePhotoUrl(photoName: string, maxWidth = 1200): string {
  const apiKey = env.GOOGLE_MAP_API_KEY;
  return (
    `https://places.googleapis.com/v1/${photoName}/media` +
    `?maxWidthPx=${maxWidth}&key=${apiKey}&skipHttpRedirect=true`
  );
}

// ─── S3 upload helper ─────────────────────────────────────────────────────────

/** Download an image from `sourceUrl` and upload it to S3; returns the public S3 URL. */
const uploadImageFromUrlToS3 = (sourceUrl: string) => copyImageToBucket(sourceUrl);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Given a Google Place ID, fetch its photo + website and upload the photo to S3.
 *
 * Returns { imageUrl, websiteUrl } — either field may be null if not available.
 *
 * Throws on unrecoverable errors (network failure, bad API key, etc.) so the
 * caller can decide whether to skip or fail the whole pin.
 */
export async function enrichPinFromGooglePlace(gPlaceId: string): Promise<PlaceEnrichment> {
  const { photoName } = await fetchGooglePlaceDetails(gPlaceId);

  let imageUrl: string | null = null;

  if (photoName) {
    const photoMediaUrl = buildPlacePhotoUrl(photoName);

    // Google returns a JSON wrapper when skipHttpRedirect=true
    const mediaRes = await fetch(photoMediaUrl, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!mediaRes.ok) {
      throw new Error(`Google photo media error ${mediaRes.status}: ${photoName}`);
    }

    const mediaData = (await mediaRes.json()) as { photoUri?: string };
    const directPhotoUrl = mediaData.photoUri;

    if (directPhotoUrl) {
      imageUrl = await uploadImageFromUrlToS3(directPhotoUrl);
    }
  }

  return { imageUrl };
}
