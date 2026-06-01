/**
 * Read the visitor's coders.kr UUID from the request headers.
 *
 * The platform gate validates the `coders_session` cookie *before* the
 * request reaches Next.js, and stamps the identity as `X-Coders-User`
 * on the way in. This helper just reads that header inside a Server
 * Component or route handler — no fetching, no client-side state.
 *
 * Returns null if the visitor is anonymous.
 */
import { headers } from "next/headers";

export async function getCodersUser(): Promise<string | null> {
  const h = await headers();
  const v = h.get("x-coders-user");
  return v && v.length > 0 ? v : null;
}

/**
 * Build a URL that bounces the visitor through the platform sign-in
 * page and back to `returnTo` (or the current page) after they sign in.
 *
 * The platform validates `return_to`: only relative paths and
 * `https://*.coders.kr/...` URLs are accepted.
 */
export function signInHref(returnTo?: string): string {
  const target = returnTo ?? "/";
  return `https://mcp.coders.kr/sso/login?return_to=${encodeURIComponent(target)}`;
}

export function signOutHref(returnTo?: string): string {
  const target = returnTo ?? "/";
  return `https://mcp.coders.kr/sso/logout?return_to=${encodeURIComponent(target)}`;
}
