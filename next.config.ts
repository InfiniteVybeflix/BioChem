import type { NextConfig } from "next";

/**
 * Next 16 note: Turbopack is the default bundler for dev and build. The usual
 * PWA plugins (@serwist/next, next-pwa) inject webpack hooks that Turbopack
 * never executes, so the service worker would silently never be emitted.
 * BioChem therefore ships a self-contained, bundler-independent service worker
 * (public/sw.js) with precaching, offline fallback, background sync, push and
 * share-target support. See scripts/generate-icons.mjs and README → PWA.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  typescript: {
    // BioChem ships with a strict type contract — build must fail on type errors.
    ignoreBuildErrors: false,
  },
  // Linting runs through the ESLint CLI (bun run lint / CI) — Next 16
  // no longer reads the `eslint` key from this config.
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // Supabase Storage (avatars, past papers, content uploads)
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      // Wikimedia Commons — AI answers embed attributed open images.
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
    ];
  },
};

export default nextConfig;
