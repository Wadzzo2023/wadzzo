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
  transpilePackages: ["three"],

  /**
   * Murals: server-side MobileCLIP (src/server/murals/clip.ts). Native
   * binaries can't go through webpack, so these load from node_modules at
   * runtime; and only the Linux x64 onnxruntime build ships to Vercel
   * (~45 MB instead of ~290 MB for every platform).
   */
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        {
          "@huggingface/transformers": "commonjs @huggingface/transformers",
          "onnxruntime-node": "commonjs onnxruntime-node",
          sharp: "commonjs sharp",
        },
      ];
    } else {
      // The browser build of transformers never touches these; keep webpack
      // from trying to resolve their native bits for the client bundle.
      config.resolve.alias = { ...config.resolve.alias, sharp$: false, "onnxruntime-node$": false };
    }
    return config;
  },
  experimental: {
    // onnxruntime loads its .so by a computed path the tracer can't follow.
    outputFileTracingIncludes: {
      "/api/trpc/[trpc]": ["node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**"],
      "/api/mobile/**": ["node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**"],
    },
    outputFileTracingExcludes: {
      "*": [
        "node_modules/**/onnxruntime-node/bin/napi-v6/darwin/**",
        "node_modules/**/onnxruntime-node/bin/napi-v6/win32/**",
        "node_modules/**/onnxruntime-node/bin/napi-v6/linux/arm64/**",
        "node_modules/**/onnxruntime-web/**",
      ],
    },
  },
  reactStrictMode: true,
  images: {
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

  /**
   * If you are using `appDir` then you must comment the below `i18n` config out.
   *
   * @see https://github.com/vercel/next.js/issues/41980
   */
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
  },
};

export default withBundleAnalyzer(config);
