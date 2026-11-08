import { describe, expect, it, vi } from "vitest";

vi.mock("../server/ai/openai", () => ({ openai: {}, IMAGE_MODEL: "test-model" }));

import {
  decodeDataUrl,
  enhancePrompt,
  pagePreviewImage,
  silhouettePrompt,
} from "../server/ai/silhouette";

describe("reference images from the browser", () => {
  it("reads a PNG data URL", () => {
    const r = decodeDataUrl(`data:image/png;base64,${Buffer.from("png").toString("base64")}`);
    expect(r.type).toBe("image/png");
    expect(r.bytes.toString()).toBe("png");
  });

  it.each([
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:text/html;base64,PGh0bWw+",
    "not a data url",
  ])("refuses %s", (bad) => {
    expect(() => decodeDataUrl(bad)).toThrow(/PNG, JPG or WebP/);
  });
});

describe("reference links to web pages", () => {
  it("uses the page's preview image, resolved against the page", () => {
    const html = `<head><meta name="description" content="x"><meta property="og:image" content="/img/troll.png?a=1&amp;b=2"></head>`;
    expect(pagePreviewImage(html, "https://example.com/trolls/page")).toBe(
      "https://example.com/img/troll.png?a=1&b=2",
    );
  });

  it("falls back to the Twitter card image", () => {
    const html = `<meta content="https://cdn.example.com/c.jpg" name="twitter:image">`;
    expect(pagePreviewImage(html, "https://example.com")).toBe("https://cdn.example.com/c.jpg");
  });

  it("finds nothing on a page without one", () => {
    expect(pagePreviewImage("<html><body>hi</body></html>", "https://example.com")).toBeNull();
  });
});

describe("silhouettePrompt", () => {
  it("asks for one solid shape and an original design without a reference", () => {
    const p = silhouettePrompt("a friendly forest troll", false);
    expect(p).toMatch(/a friendly forest troll/);
    expect(p).toMatch(/ONE solid black filled shape/);
    expect(p).toMatch(/original design/);
  });

  it("follows the reference when the brand gave one", () => {
    expect(silhouettePrompt("our mascot", true)).toMatch(/shape of the reference image/);
  });
});

describe("enhancePrompt", () => {
  it("asks for the same subject, cleaned up, evened out and as one solid shape", () => {
    const p = enhancePrompt();
    expect(p).toMatch(/same subject/);
    expect(p).toMatch(/symmetrical/);
    expect(p).toMatch(/ONE solid black filled shape/);
    expect(p).not.toMatch(/Also:/);
  });

  it("adds the brand's instruction when there is one", () => {
    expect(enhancePrompt("  make the horns bigger ")).toMatch(/Also: make the horns bigger\./);
    expect(enhancePrompt("   ")).not.toMatch(/Also:/);
  });
});
