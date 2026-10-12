import { beforeEach, describe, expect, it, vi } from "vitest";

const presigner = vi.hoisted(() => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed.example/upload"),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => presigner);

import { signCreatorUpload } from "../endpoint-uploads";
import { signEntryUpload, signImageUpload } from "../presign";
import {
  CREATOR_FILE_TYPES,
  ENTRY_FILE_TYPES,
  entryFileProblem,
  imageFileProblem,
  MAX_CREATOR_FILE_BYTES,
  MAX_IMAGE_BYTES,
} from "../upload-rules";

const file = (overrides = {}) => ({
  fileType: "image/png",
  fileSize: 1024,
  checksum: "abc",
  fileName: "a.png",
  ...overrides,
});

beforeEach(() => presigner.getSignedUrl.mockClear());

describe("signed uploads", () => {
  it("signs an allowed file and returns where it will live", async () => {
    const result = await signCreatorUpload(file());
    expect(result.uploadUrl).toBe("https://signed.example/upload");
    expect(result.fileUrl).toMatch(/^https:\/\/test-bucket\.s3\.amazonaws\.com\/[0-9a-f]{64}$/);
    expect(result.fileName).toBe("a.png");
  });

  it("refuses too-large and not-allowed files with a validation error", async () => {
    await expect(
      signCreatorUpload(file({ fileSize: MAX_CREATOR_FILE_BYTES + 1 })),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      signCreatorUpload(file({ fileType: "application/x-msdownload" })),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(signImageUpload(file({ fileSize: MAX_IMAGE_BYTES + 1 }))).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(signEntryUpload(file({ fileType: "text/html" }))).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(presigner.getSignedUrl).not.toHaveBeenCalled();
  });

  it("never signs executable or html content for fans", () => {
    for (const type of ["text/html", "application/x-msdownload", "image/svg+xml"]) {
      expect(ENTRY_FILE_TYPES).not.toContain(type);
    }
    expect(CREATOR_FILE_TYPES).toContain("image/png");
  });
});

describe("client-side file checks", () => {
  it("explains why a file can't be used", () => {
    expect(entryFileProblem({ type: "image/png", size: 10 })).toBeNull();
    expect(entryFileProblem({ type: "text/html", size: 10 })).toMatch(/can't be attached/);
    expect(imageFileProblem({ type: "image/webp", size: 10 })).toBeNull();
    expect(imageFileProblem({ type: "image/png", size: MAX_IMAGE_BYTES + 1 })).toMatch(/10 MB/);
  });
});
