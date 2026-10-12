import { describe, expect, it } from "vitest";

import {
  assertInPlatformScope,
  brandWorksOnPlatform,
  canAdminPlatform,
  isInPlatformScope,
  platformScope,
  relationScope,
} from "../scope";

const root = { platform: { id: "wadzzo", isRoot: true } };
const clinton = { platform: { id: "clintoncounty", isRoot: false } };

describe("platformScope", () => {
  it("limits a partner platform to its own rows, whatever the filter says", () => {
    expect(platformScope(clinton)).toEqual({ platformId: "clintoncounty" });
    expect(platformScope(clinton, "wadzzo")).toEqual({ platformId: "clintoncounty" });
  });

  it("lets the root platform see everything, or one platform by filter", () => {
    expect(platformScope(root)).toEqual({});
    expect(platformScope(root, null)).toEqual({});
    expect(platformScope(root, "clintoncounty")).toEqual({ platformId: "clintoncounty" });
  });

  it("relationScope is undefined when unscoped, so rows without the relation stay visible", () => {
    expect(relationScope(root)).toBeUndefined();
    expect(relationScope(clinton)).toEqual({ platformId: "clintoncounty" });
  });
});

describe("row visibility", () => {
  it("shows partner rows to the root and own rows to the partner", () => {
    expect(isInPlatformScope(root, "clintoncounty")).toBe(true);
    expect(isInPlatformScope(clinton, "clintoncounty")).toBe(true);
    expect(isInPlatformScope(clinton, "wadzzo")).toBe(false);
    expect(isInPlatformScope(clinton, null)).toBe(false);
  });

  it("hides rows outside the scope behind NOT_FOUND, not FORBIDDEN", () => {
    expect(() => assertInPlatformScope(clinton, "wadzzo")).toThrowError(
      expect.objectContaining({ code: "RESOURCE_NOT_FOUND" }),
    );
    expect(() => assertInPlatformScope(clinton, "clintoncounty")).not.toThrow();
  });
});

describe("who may manage a platform", () => {
  it("admins manage their own platform; root admins manage every platform", () => {
    const clintonAdmin = { platformId: "clintoncounty", platform: { isRoot: false } };
    const rootAdmin = { platformId: "wadzzo", platform: { isRoot: true } };
    expect(canAdminPlatform(clintonAdmin, clinton.platform)).toBe(true);
    expect(canAdminPlatform(clintonAdmin, root.platform)).toBe(false);
    expect(canAdminPlatform(rootAdmin, clinton.platform)).toBe(true);
  });

  it("brands work on their own platform's portal or the root portal", () => {
    expect(brandWorksOnPlatform(root.platform, "clintoncounty")).toBe(true);
    expect(brandWorksOnPlatform(clinton.platform, "clintoncounty")).toBe(true);
    expect(brandWorksOnPlatform(clinton.platform, "wadzzo")).toBe(false);
    expect(brandWorksOnPlatform(clinton.platform, null)).toBe(false);
  });
});
