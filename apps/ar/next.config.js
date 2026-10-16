/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import analyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = analyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import("next").NextConfig} */
const config = {
  // Browser bundles read the platform from here (see @wadzzo/platform/branding).
  env: { NEXT_PUBLIC_PLATFORM_SLUG: process.env.PLATFORM_SLUG ?? "wadzzo" },
  transpilePackages: [
    // Bundled, not loaded as externals: firebase-admin -> jwks-rsa -> jose is ES-module only
    // and an external require() of it fails on Node versions without require(esm).
    "firebase-admin",
    "jwks-rsa",
    "jose",
    "three",
    "@wadzzo/db",
    "@wadzzo/errors",
    "@wadzzo/platform",
    "@wadzzo/stellar",
    "@wadzzo/ui",
    "@wadzzo/utils",
    "@wadzzo/wallet",
  ],

  /**
   * Murals: server-side MobileCLIP (src/server/murals/clip.ts). Native
   * binaries can't go through webpack, so these load from node_modules at
   * runtime; and only the Linux x64 onnxruntime build ships to Vercel
   * (~45 MB instead of ~290 MB for every platform).
   */
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals)
          ? config.externals
          : [config.externals].filter(Boolean)),
        {
          "@huggingface/transformers": "commonjs @huggingface/transformers",
          "onnxruntime-node": "commonjs onnxruntime-node",
          sharp: "commonjs sharp",
        },
      ];
    } else {
      // The browser build of transformers never touches these; keep webpack
      // from trying to resolve their native bits for the client bundle.
      config.resolve.alias = {
        ...config.resolve.alias,
        sharp$: false,
        "onnxruntime-node$": false,
      };
      // onnxruntime-web has `new URL("./ort.webgpu.bundle.min.mjs", import.meta.url)`,
      // so webpack copies that ESM file into static/media as a plain asset and
      // the minifier then fails on its `import.meta` (production builds only).
      // The copy is never used: transformers.js points ONNX at the jsDelivr
      // CDN for its .mjs/.wasm at runtime. So don't turn those URLs into assets.
      config.module.rules.push({
        test: /[\\/]onnxruntime-web[\\/]/,
        parser: { url: false },
      });
    }
    return config;
  },
  // onnxruntime loads its .so by a computed path the tracer can't follow.
  outputFileTracingIncludes: {
    "/api/trpc/[trpc]": [
      "node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**",
    ],
    "/api/mobile/**": [
      "node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**",
    ],
  },
  outputFileTracingExcludes: {
    "*": [
      "node_modules/**/onnxruntime-node/bin/napi-v6/darwin/**",
      "node_modules/**/onnxruntime-node/bin/napi-v6/win32/**",
      "node_modules/**/onnxruntime-node/bin/napi-v6/linux/arm64/**",
      "node_modules/**/onnxruntime-web/**",
    ],
  },
  reactStrictMode: true,
  images: {
    // Next 16 only serves qualities listed here (default [75]). The mobile
    // app's AR asks for q=70 (builds up to 6.0.1/203) and gets a 400 without
    // it, which crashed AR: the coin textures never loaded.
    qualities: [70, 75],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
    // NFT thumbnails can be user-uploaded SVGs (see src/server/pinata.ts's
    // upload allowlist). SVGs can embed <script>/event handlers, so this
    // pairing is required: contentDispositionType forces `Content-Disposition:
    // attachment` on the optimizer's own responses (no inline script context
    // even if someone navigates straight to the URL), and contentSecurityPolicy
    // sandboxes anything the optimizer does serve inline, disabling script
    // execution and plugin/frame embedding entirely.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  async rewrites() {
    return [
      {
        source: "/.well-known/stellar.toml",
        destination: "/api/toml",
      },
    ];
  },
};

export default withBundleAnalyzer(config);
