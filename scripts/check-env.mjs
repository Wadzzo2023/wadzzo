#!/usr/bin/env node
// Pre-deploy check for the apps' real env files (apps/<app>/.env*, git-ignored).
//
// The apps deploy separately (app.wadzzo.com, brand.wadzzo.com, web.wadzzo.com)
// but share one database, one set of platform wallets and one bucket, so a few
// values must be identical everywhere and the URLs must agree with each other.
// Secrets are compared by hash and never printed.
//
//   pnpm env:check            both modes
//   pnpm env:check production
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modes = process.argv[2] ? [process.argv[2]] : ["development", "production"];

/** Same value in every app that sets it. */
const MUST_MATCH = [
  "DATABASE_URL",
  "ISSUER_ENCRYPTION_KEY",
  "MOTHER_SECRET",
  "STORAGE_SECRET",
  "RUBY_ACCOUNTS_SECRET",
  "NEXT_PUBLIC_ASSET_CODE",
  "NEXT_PUBLIC_ASSET_ISSUER",
  "NEXT_PUBLIC_STELLAR_NETWORK",
  "NEXT_PUBLIC_HOME_DOMAIN",
  "PLATFORM_SLUG",
  "AWS_BUCKET_NAME",
  "AWS_BUCKET_REGION",
  "AWS_ACCESS_KEY",
  "AWS_SECRET_ACCESS_KEY",
  "NEXT_PUBLIC_AUTH_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
];
const SECRET = /SECRET|KEY|PASS|TOKEN|DATABASE_URL/;

function parse(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m || line.trim().startsWith("#")) continue;
    out[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}
const load = (app, mode) => ({
  ...parse(`${root}/apps/${app}/.env`),
  ...parse(`${root}/apps/${app}/.env.${mode}`),
});

// The three public domains, from the platform branding (the one place they are written down).
const branding = fs.readFileSync(`${root}/packages/platform/src/branding/wadzzo.ts`, "utf8");
const url = (key) => branding.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1];
const DOMAINS = { ar: url("arWeb"), brand: url("brandPortal"), market: url("fanApp") };
const normal = (u) => (u ?? "").replace(/\/+$/, "").toLowerCase();
const hash = (v) => createHash("sha256").update(v).digest("hex").slice(0, 6);
const hostOf = (v) => {
  try {
    return new URL(v).hostname;
  } catch {
    return "?";
  }
};

let problems = 0;
const bad = (msg) => {
  problems++;
  console.log(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

for (const mode of modes) {
  console.log(`\n── ${mode} ──`);
  const env = { brand: load("brand", mode), market: load("market", mode), ar: load("ar", mode) };
  const express = parse(`${root}/apps/express-wadzzo/.env`);

  // 1. values that must match across apps
  const before = problems;
  for (const key of MUST_MATCH) {
    const present = Object.entries(env).filter(([, e]) => e[key]);
    if (present.length < 2) continue;
    const distinct = new Set(present.map(([, e]) => e[key]));
    if (distinct.size === 1) continue;
    const detail = present
      .map(([app, e]) =>
        key === "DATABASE_URL" ? `${app}=${hostOf(e[key])}` : `${app}=${hash(e[key])}`,
      )
      .join("  ");
    bad(`${key} differs between apps (${detail})`);
  }
  if (problems === before)
    ok("shared secrets, database, bucket and token settings agree across apps");

  // 2. the task server must derive the same key as the brand portal
  if (express.NEXTAUTH_SECRET && env.brand.NEXTAUTH_SECRET) {
    if (express.NEXTAUTH_SECRET === env.brand.NEXTAUTH_SECRET)
      ok("brand and task server share NEXTAUTH_SECRET");
    else
      bad(
        "brand NEXTAUTH_SECRET differs from the task server's (task-server calls will be rejected)",
      );
  }

  // 3. URLs: each app's own URL, and the links between apps (Wadzzo platform only)
  if (mode !== "production") continue;
  for (const [app, e] of Object.entries(env)) {
    const own = normal(e.NEXT_PUBLIC_URL);
    const auth = normal(e.NEXTAUTH_URL);
    if (/localhost|127\.0\.0\.1/.test(auth))
      bad(`${app}: NEXTAUTH_URL is ${e.NEXTAUTH_URL} in the production file`);
    if (e.PLATFORM_SLUG && e.PLATFORM_SLUG !== "wadzzo") continue;
    const want = normal(DOMAINS[app]);
    if (own && own !== want)
      bad(`${app}: NEXT_PUBLIC_URL is ${e.NEXT_PUBLIC_URL}, expected ${DOMAINS[app]}`);
    if (auth && !/localhost/.test(auth) && auth !== want)
      bad(`${app}: NEXTAUTH_URL is ${e.NEXTAUTH_URL}, expected ${DOMAINS[app]}`);
    if (e.NEXT_PUBLIC_URL?.endsWith("/")) bad(`${app}: NEXT_PUBLIC_URL has a trailing slash`);
    if (e.NEXT_PUBLIC_STAGE && e.NEXT_PUBLIC_STAGE !== "prod")
      bad(
        `${app}: NEXT_PUBLIC_STAGE is "${e.NEXT_PUBLIC_STAGE}" in production (fees are charged only for "prod")`,
      );
  }
  const links = [
    ["brand", "NEXT_PUBLIC_WADZZO_AR_URL", DOMAINS.ar],
    ["market", "NEXT_PUBLIC_BRAND_PORTAL_URL", DOMAINS.brand],
    ["brand", "NEXT_PUBLIC_FAN_APP_URL", DOMAINS.market],
  ];
  for (const [app, key, want] of links) {
    const have = env[app][key];
    if (have && normal(have) !== normal(want)) bad(`${app}: ${key} is ${have}, expected ${want}`);
  }
  const origins = env.ar.BRAND_APP_ORIGINS;
  if (origins && !origins.split(/\s+/).map(normal).includes(normal(DOMAINS.brand))) {
    bad(`ar: BRAND_APP_ORIGINS does not include ${DOMAINS.brand}`);
  }
}

console.log(problems ? `\n${problems} problem(s).` : "\nAll consistent.");
process.exit(problems ? 1 : 0);
