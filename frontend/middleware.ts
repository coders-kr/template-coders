/**
 * /api/* → BACKEND_URL/api/* rewrite at request time.
 *
 * We don't use next.config.ts's `rewrites()` for this because Next.js
 * bakes the destination string at build time, when BACKEND_URL is unset.
 * Middleware runs per request, so `process.env.BACKEND_URL` here is the
 * value the platform injects at pod start.
 */
import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: "/api/:path*",
};

export function middleware(req: NextRequest) {
  const backend = process.env.BACKEND_URL;
  if (!backend) {
    // Fallthrough — the API route, if any, will 404. Don't crash here.
    return NextResponse.next();
  }
  const target = new URL(backend);
  target.pathname = req.nextUrl.pathname;
  target.search = req.nextUrl.search;
  return NextResponse.rewrite(target);
}
