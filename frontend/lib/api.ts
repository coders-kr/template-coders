/**
 * Tiny helpers around the in-cluster backend.
 *
 * Server-side: call BACKEND_URL directly (in-cluster DNS, no public hop).
 * The Next.js rewrites in next.config.ts handle /api/* from the browser.
 */
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function fetchFeed(): Promise<Post[]> {
  const r = await fetch(`${BACKEND}/api/feed`, { cache: "no-store" });
  if (!r.ok) return [];
  return r.json();
}

export type Post = {
  id: string;
  body: string;
  author_id: string;
  author_name: string;
  created_at: string;
};

export type Me = {
  id: string;
  coders_id: string;
  display_name: string;
  first_seen_at: string;
};

/** Server-side fetch of /api/me — forwards the X-Coders-User header so
 * the backend sees the same identity the gate stamped on us. */
export async function fetchMe(codersId: string): Promise<Me | null> {
  const r = await fetch(`${BACKEND}/api/me`, {
    cache: "no-store",
    headers: { "X-Coders-User": codersId },
  });
  if (!r.ok) return null;
  return r.json();
}
