import type { NextConfig } from "next";

const ONE_YEAR = 31_536_000;

const nextConfig: NextConfig = {
  // Keep Next.js output tracing rooted at this repo. Chandler's Windows home has
  // an unrelated parent package-lock.json, which otherwise triggers noisy local
  // build warnings and can make build output less reproducible.
  outputFileTracingRoot: process.cwd(),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: `public, max-age=${ONE_YEAR}, immutable`,
          },
        ],
      },
      {
        source: "/:path*.(jpg|jpeg|png|webp|avif|svg|ico|gif|woff|woff2)",
        headers: [
          {
            key: "Cache-Control",
            value: `public, max-age=${ONE_YEAR}, immutable`,
          },
        ],
      },
      {
        // Keep HTML dynamic, but stop forcing every asset onto a short cache leash.
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
