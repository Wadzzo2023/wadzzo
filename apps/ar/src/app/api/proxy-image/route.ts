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
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: { ...CORS, "Access-Control-Allow-Headers": "Content-Type" },
  });
}

export async function GET(req: Request) {
  const imageUrl = new URL(req.url).searchParams.get("url");
  if (!imageUrl) return Response.json({ error: "Missing url parameter" }, { status: 400 });

  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!response.ok)
      return Response.json(
        { error: `Failed to fetch image: ${response.statusText}` },
        { status: response.status },
      );

    const buffer = await response.arrayBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": response.headers.get("content-type") ?? "image/jpeg",
        "Content-Length": buffer.byteLength.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Image proxy error:", error);
    return Response.json({ error: "Failed to proxy image" }, { status: 500 });
  }
}
