import { describe, expect, it } from "vitest";

import { abbreviateAddress, isInvalidPublicKey } from "../address";
import { nonBlank } from "../blank";
import { ipfsHashToUrl, urlToIpfsHash } from "../ipfs";
import { generateRedeemCode } from "../redeem-code";
import { isValidUrl, truncateMiddle } from "../string";

describe("truncateMiddle / abbreviateAddress", () => {
  it("keeps the edges of a long string", () => {
    expect(truncateMiddle("ABCDEFGHIJ", 2, 3)).toBe("AB...HIJ");
    expect(abbreviateAddress("GABCDEFGHIJKLMNOPQRSTUVWXYZ", 4)).toBe("GABC...WXYZ");
  });

  it("leaves short strings and missing addresses alone", () => {
    expect(truncateMiddle("ABCDEF", 3, 3)).toBe("ABCDEF");
    expect(abbreviateAddress(undefined)).toBe("");
    expect(abbreviateAddress("")).toBe("");
  });
});

describe("isInvalidPublicKey", () => {
  it("wants exactly 56 characters", () => {
    expect(isInvalidPublicKey("G".repeat(56))).toBe(false);
    expect(isInvalidPublicKey("G".repeat(55))).toBe(true);
    expect(isInvalidPublicKey("   ")).toBe(true);
    expect(isInvalidPublicKey(undefined)).toBe(true);
  });
});

describe("generateRedeemCode", () => {
  it("is 6 unambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateRedeemCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it("doesn't repeat itself", () => {
    const codes = new Set(Array.from({ length: 500 }, generateRedeemCode));
    expect(codes.size).toBeGreaterThan(495);
  });
});

describe("small helpers", () => {
  it("nonBlank treats whitespace as missing", () => {
    expect(nonBlank("  hi ")).toBe("hi");
    expect(nonBlank("   ")).toBeUndefined();
    expect(nonBlank(null)).toBeUndefined();
  });

  it("round-trips ipfs urls", () => {
    expect(urlToIpfsHash(ipfsHashToUrl("QmHash"))).toBe("QmHash");
    expect(urlToIpfsHash(null)).toBeUndefined();
  });

  it("validates urls", () => {
    expect(isValidUrl("https://wadzzo.com")).toBe(true);
    expect(isValidUrl("wadzzo")).toBe(false);
  });
});
