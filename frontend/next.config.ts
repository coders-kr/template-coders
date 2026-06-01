import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // /api/* is proxied to the backend via middleware.ts (request-time),
  // not via `rewrites()` (build-time, BACKEND_URL isn't known then).
};

export default nextConfig;
