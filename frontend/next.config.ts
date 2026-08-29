import type { NextConfig } from "next";

const developmentRoutes: Partial<NextConfig> =
  process.env.NODE_ENV === "development"
    ? {
        async rewrites() {
          const backend = process.env.BACKEND_URL ?? "http://localhost:8000";
          return [
            {
              source: "/api/:path*",
              destination: `${backend}/api/:path*`,
            },
          ];
        },
      }
    : {};

const nextConfig: NextConfig = {
  // Pre-render every page at build time → produces ./out/ as a tree
  // of HTML, JS, and CSS that nginx serves verbatim. No Node runtime,
  // no headers() at request time, no middleware. All identity + data
  // fetching happens client-side.
  output: "export",
  // SPA-style routing fallback inside `out/` is handled by the nginx
  // config (try_files … /index.html).
  trailingSlash: false,
  // The production image proxies /api through nginx. During `next dev` there
  // is no nginx, so mirror that route here. The conditional spread keeps
  // custom routes out of static production exports entirely.
  ...developmentRoutes,
};

export default nextConfig;
