#!/usr/bin/env node
// Prepares an app for the platform it is being built for (PLATFORM_SLUG):
//   - src/styles/platform-theme.css  <- themes/<slug>/<app>.css
//   - public/platform/**             <- assets/<slug>/<app>/**
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
    const match = /^\s*PLATFORM_SLUG\s*=\s*["']?([\w-]+)["']?\s*$/m.exec(fs.readFileSync(full, "utf8"));
    if (match?.[1]) return match[1];
  }
  return DEFAULT_SLUG;
}

const slug = resolveSlug();
const themeFile = [path.join(platformRoot, "themes", slug, `${app}.css`), path.join(platformRoot, "themes", DEFAULT_SLUG, `${app}.css`)].find(fs.existsSync);
const target = path.join(appRoot, "src/styles/platform-theme.css");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(
  target,
  `/* GENERATED for PLATFORM_SLUG=${slug} by packages/platform/scripts/sync-platform-assets.mjs. Do not edit or commit. */\n${themeFile ? fs.readFileSync(themeFile, "utf8") : ""}`,
);

const publicDir = path.join(appRoot, "public/platform");
fs.rmSync(publicDir, { recursive: true, force: true });
const assetsDir = path.join(platformRoot, "assets", slug, app);
if (fs.existsSync(assetsDir)) fs.cpSync(assetsDir, publicDir, { recursive: true });

console.log(`[platform] ${app}: ${slug}${themeFile ? "" : " (no theme)"}${fs.existsSync(assetsDir) ? " + assets" : ""}`);
