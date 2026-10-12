import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const serverOnlyStub = fileURLToPath(new URL("./server-only.ts", import.meta.url));

/** `~/` points at the app's src, and `server-only` becomes a no-op. */
const aliases = (appRoot) => [
  { find: "server-only", replacement: serverOnlyStub },
  { find: /^~\//, replacement: `${path.resolve(appRoot, "src")}/` },
];

/** Fast unit tests (no network, no database). */
export function unitTestConfig(appRoot, { include = ["tests/**/*.test.ts", "src/**/*.test.ts"] } = {}) {
  return defineConfig({
    resolve: { alias: aliases(appRoot) },
    test: { environment: "node", include, exclude: ["node_modules/**", ".next/**", "e2e/**"] },
  });
}

/** End-to-end tests: hit the dev database and Stellar testnet (`pnpm test:e2e`). */
export function e2eTestConfig(appRoot) {
  return defineConfig({
    resolve: { alias: aliases(appRoot) },
    test: { include: ["e2e/**/*.test.ts"], environment: "node", testTimeout: 280_000, hookTimeout: 60_000 },
  });
}
