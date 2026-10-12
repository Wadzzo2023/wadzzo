import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getPlatformBranding } from "../branding";
import { clintonCountyBranding } from "../branding/clintoncounty";
import { wadzzoBranding } from "../branding/wadzzo";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const APPS = ["ar", "brand", "market"] as const;

describe("branding registry", () => {
  it("returns each platform's own branding and Wadzzo's for unknown slugs", () => {
    expect(getPlatformBranding("clintoncounty")).toBe(clintonCountyBranding);
    expect(getPlatformBranding("wadzzo")).toBe(wadzzoBranding);
    expect(getPlatformBranding("somebody-new")).toBe(wadzzoBranding);
  });

  it("each platform has a theme for every app", () => {
    for (const slug of ["wadzzo", "clintoncounty"]) {
      for (const app of APPS) {
        const theme = path.join(packageRoot, "themes", slug, `${app}.css`);
        expect(fs.existsSync(theme), theme).toBe(true);
      }
    }
  });
});

describe("partner platform assets", () => {
  /** Files an app gets: `shared/` plus the app's own folder (what sync-platform-assets copies). */
  function publishedFiles(slug: string, app: string): Set<string> {
    const files = new Set<string>();
    for (const folder of ["shared", app]) {
      const root = path.join(packageRoot, "assets", slug, folder);
      if (!fs.existsSync(root)) continue;
      for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const relative = path.relative(root, path.join(entry.parentPath, entry.name));
        files.add(`/platform/${relative.split(path.sep).join("/")}`);
      }
    }
    return files;
  }

  it("every app can serve every image the branding points at", () => {
    const branding = clintonCountyBranding;
    const referenced = Object.values(branding.assets).filter((url) => url.startsWith("/platform/"));
    expect(referenced.length).toBeGreaterThan(0);

    for (const app of APPS) {
      const published = publishedFiles(branding.slug, app);
      for (const url of referenced) {
        expect(published.has(url), `${app} is missing ${url}`).toBe(true);
      }
    }
  });
});
