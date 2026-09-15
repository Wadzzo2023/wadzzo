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
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
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
      {
        source: "/s3-proxy/:path*",
        destination: "https://actionverse.s3.amazonaws.com/:path*",
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
