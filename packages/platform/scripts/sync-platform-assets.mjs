#!/usr/bin/env node
// Prepares an app for the platform it is being built for (PLATFORM_SLUG):
//   - src/styles/platform-theme.css  <- themes/<slug>/poster.css (market and brand, which share
//                                       the poster look) then themes/<slug>/<app>.css
//   - public/platform/**             <- assets/<slug>/shared/** then assets/<slug>/<app>/**
//                                       (the app's own files win over shared ones)
// Both outputs are generated and git-ignored. Run from the app directory by
// the app's `predev` / `prebuild` scripts:  node <this file> <app-name>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = process.argv[2];
if (!app) {
  console.error("usage: sync-platform-assets.mjs <app-name>");
  process.exit(1);
}

const platformRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = process.cwd();
const DEFAULT_SLUG = "wadzzo";

/** PLATFORM_SLUG from the environment, else from the app's .env files (same order Next.js reads them). */
function resolveSlug() {
  if (process.env.PLATFORM_SLUG) return process.env.PLATFORM_SLUG;
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  for (const file of [`.env.${mode}.local`, ".env.local", `.env.${mode}`, ".env"]) {
    const full = path.join(appRoot, file);
    if (!fs.existsSync(full)) continue;
    const match = /^\s*PLATFORM_SLUG\s*=\s*["']?([\w-]+)["']?\s*$/m.exec(
      fs.readFileSync(full, "utf8"),
    );
    if (match?.[1]) return match[1];
  }
  return DEFAULT_SLUG;
}

const slug = resolveSlug();
/** Apps built on the shared poster look (@wadzzo/ui/styles/poster.css) also get the platform's poster.css. */
const POSTER_APPS = new Set(["market", "brand"]);
/** A platform's own file, else the default platform's. */
const themeFor = (name) =>
  [
    path.join(platformRoot, "themes", slug, name),
    path.join(platformRoot, "themes", DEFAULT_SLUG, name),
  ].find(fs.existsSync);
const themeFiles = [
  POSTER_APPS.has(app) ? themeFor("poster.css") : undefined,
  themeFor(`${app}.css`),
].filter(Boolean);
// @import must precede every other rule, so the files' imports are hoisted to the top.
const sources = themeFiles.map((file) => fs.readFileSync(file, "utf8"));
const isImport = (line) => /^@import\s/.test(line);
const imports = sources.flatMap((css) => css.split("\n").filter(isImport));
const rules = sources.map((css) =>
  css
    .split("\n")
    .filter((line) => !isImport(line))
    .join("\n"),
);
const target = path.join(appRoot, "src/styles/platform-theme.css");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(
  target,
  [
    `/* GENERATED for PLATFORM_SLUG=${slug} by packages/platform/scripts/sync-platform-assets.mjs. Do not edit or commit. */`,
    ...imports,
    ...rules,
  ].join("\n"),
);

const publicDir = path.join(appRoot, "public/platform");
fs.rmSync(publicDir, { recursive: true, force: true });
const assetDirs = ["shared", app]
  .map((name) => path.join(platformRoot, "assets", slug, name))
  .filter(fs.existsSync);
for (const dir of assetDirs) fs.cpSync(dir, publicDir, { recursive: true });

console.log(
  `[platform] ${app}: ${slug}${themeFiles.length ? "" : " (no theme)"}${assetDirs.length ? " + assets" : ""}`,
);
