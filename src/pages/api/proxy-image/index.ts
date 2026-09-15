import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Ported from bandfan's `api/proxy-image` — same route, same purpose.
 *
 * A pin's image can come from anywhere a creator uploaded it (S3, an
 * external CDN) and Three.js's `TextureLoader` decodes images into a WebGL
 * texture via canvas, which the browser refuses cross-origin unless the
 * remote server sends a permissive CORS header. Most origins pin images
 * happen to live on don't. Fetching server-side and re-serving with our own
 * `Access-Control-Allow-Origin` sidesteps that without needing every image
 * host to cooperate.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { url: imageUrl } = req.query;

  if (!imageUrl || typeof imageUrl !== "string") {
    res.status(400).json({ error: "Missing url parameter" });
    return;
  }

  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      res
        .status(response.status)
        .json({ error: `Failed to fetch image: ${response.statusText}` });
      return;
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "image/jpeg";

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", buffer.byteLength.toString());
    res.setHeader("Cache-Control", "public, max-age=3600");

    res.status(200).end(Buffer.from(buffer));
  } catch (error) {
    console.error("Image proxy error:", error);
    res.status(500).json({ error: "Failed to proxy image" });
  }
}
