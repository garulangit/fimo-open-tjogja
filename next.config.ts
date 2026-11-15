import type { NextConfig } from "next";

// Security headers for all app routes (audit 9 Nov 2026, item L1).
// frame-ancestors 'self' (not DENY) because the app legitimately frames its
// own same-origin static tools (Photo Stamp) inside the shell.
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
