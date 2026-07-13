import type { NextConfig } from "next";

const ONE_YEAR = 31_536_000;

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://bourbonsignal.com https://*.clerk.com https://*.clerk.accounts.dev https://js.stripe.com https://vercel.live",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://bourbonsignal.com https://*.clerk.com https://*.clerk.accounts.dev https://api.stripe.com https://*.vercel-insights.com https://vercel.live",
      "frame-src https://*.clerk.com https://*.clerk.accounts.dev https://js.stripe.com https://challenges.cloudflare.com https://vercel.live",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests",
    ].join("; "),
  },
] as const;

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
        source: "/dashboard",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0",
          },
          {
            key: "Clear-Site-Data",
            value: '"cache"',
          },
        ],
      },
      {
        source: "/api/sightings/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0",
          },
        ],
      },
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
          ...SECURITY_HEADERS,
        ],
      },
    ];
  },
};

export default nextConfig;
