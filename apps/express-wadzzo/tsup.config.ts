import { defineConfig } from "tsup";

/**
 * The service ships as one CommonJS file. Workspace packages (`@wadzzo/*`) are
 * TypeScript source, so they are bundled in; third-party dependencies stay
 * external and are installed on the server with `pnpm install`.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  noExternal: [/^@wadzzo\//],
});
