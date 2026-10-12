import { beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => dns);

import { assertPublicHttpUrl, fetchPublicFile } from "../public-url-guard";

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

const refused = { code: "VALIDATION_FAILED" };

describe("assertPublicHttpUrl", () => {
  it("accepts public http(s) links", async () => {
    await expect(assertPublicHttpUrl("https://example.com/a.png")).resolves.toBeInstanceOf(URL);
    await expect(assertPublicHttpUrl("http://93.184.216.34/a.png")).resolves.toBeInstanceOf(URL);
  });

  it.each([
    "file:///etc/passwd",
    "ftp://example.com/a.png",
    "javascript:alert(1)",
    "not a url",
    "http://localhost/a.png",
    "http://app.localhost/a.png",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://127.0.0.1/a.png",
    "http://10.0.0.5/a.png",
    "http://172.16.4.1/a.png",
    "http://192.168.1.1/a.png",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/a.png",
    "http://[::1]/a.png",
    "http://[fd00::1]/a.png",
    "http://[::ffff:10.0.0.1]/a.png",
  ])("refuses %s", async (url) => {
    await expect(assertPublicHttpUrl(url)).rejects.toMatchObject(refused);
  });

  it("refuses a host name that resolves inside the network", async () => {
    dns.lookup.mockResolvedValue([{ address: "10.1.2.3", family: 4 }]);
    await expect(assertPublicHttpUrl("https://sneaky.example.com/a.png")).rejects.toMatchObject(
      refused,
    );
  });

  it("refuses a host that doesn't resolve", async () => {
    dns.lookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertPublicHttpUrl("https://nope.invalid/a.png")).rejects.toMatchObject(refused);
  });
});

describe("fetchPublicFile", () => {
  const ok = (body: string, headers: Record<string, string> = {}) =>
    new Response(body, { status: 200, headers: { "content-type": "image/png", ...headers } });

  it("returns the bytes and content type", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok("pixels")));
    const file = await fetchPublicFile("https://example.com/a.png");
    expect(file.bytes.toString()).toBe("pixels");
    expect(file.contentType).toBe("image/png");
  });

  it("checks every redirect hop, not just the first URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPublicFile("https://example.com/a.png")).rejects.toMatchObject(refused);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("follows a redirect to another public host", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "https://cdn.example.com/a.png" } }),
      )
      .mockResolvedValueOnce(ok("pixels"));
    vi.stubGlobal("fetch", fetchMock);

    const file = await fetchPublicFile("https://example.com/a.png");
    expect(file.bytes.toString()).toBe("pixels");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up on redirect loops", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            new Response(null, { status: 302, headers: { location: "https://example.com/again" } }),
          ),
        ),
    );
    await expect(fetchPublicFile("https://example.com/a.png")).rejects.toMatchObject(refused);
  });

  it("refuses files over the limit, declared or not", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(ok("x", { "content-length": String(10 * 1024 * 1024) })),
    );
    await expect(
      fetchPublicFile("https://example.com/a.png", { maxBytes: 1024 }),
    ).rejects.toMatchObject(refused);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok("x".repeat(2048))));
    await expect(
      fetchPublicFile("https://example.com/a.png", { maxBytes: 1024 }),
    ).rejects.toMatchObject(refused);
  });

  it("reports a failed download as an external-service error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 404 })));
    await expect(fetchPublicFile("https://example.com/a.png")).rejects.toMatchObject({
      code: "EXTERNAL_SERVICE_FAILED",
    });
  });
});
