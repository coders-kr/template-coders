import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Proxy /api/* to the backend service. The platform delivers BACKEND_URL
  // at pod-start time; we fall back to a syntactically-valid placeholder
  // so `next build` doesn't blow up during the build step.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL ?? "http://localhost:8000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
