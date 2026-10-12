import { afterEach, describe, expect, it, vi } from "vitest";

import { getBucketName, publicS3Url } from "../bucket";

afterEach(() => vi.unstubAllEnvs());

describe("bucket settings", () => {
  it("reads the web apps' NEXT_AWS_* names (what their env files have always used)", () => {
    vi.stubEnv("AWS_BUCKET_NAME", "");
    vi.stubEnv("NEXT_AWS_BUCKET_NAME", "legacy-bucket");
    expect(getBucketName()).toBe("legacy-bucket");
    expect(publicS3Url("a.png")).toBe("https://legacy-bucket.s3.amazonaws.com/a.png");
  });

  it("prefers the plain AWS_* names when both are set", () => {
    vi.stubEnv("AWS_BUCKET_NAME", "plain-bucket");
    vi.stubEnv("NEXT_AWS_BUCKET_NAME", "legacy-bucket");
    expect(getBucketName()).toBe("plain-bucket");
  });

  it("names the missing variable", () => {
    vi.stubEnv("AWS_BUCKET_NAME", "");
    vi.stubEnv("NEXT_AWS_BUCKET_NAME", "");
    expect(() => getBucketName()).toThrowError(/AWS_BUCKET_NAME/);
  });
});
