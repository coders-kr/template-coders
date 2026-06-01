import Link from "next/link";

import { type Post } from "@/lib/api";
import { getCodersUser } from "@/lib/identity";
import { SignInLink } from "@/components/SignIn";

export const dynamic = "force-dynamic";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export default async function ProfilePage() {
  const codersId = await getCodersUser();
  if (!codersId) {
    return (
      <div>
        <h1 style={{ marginTop: 0 }}>Profile</h1>
        <p>You need to sign in to see this page.</p>
        <SignInLink returnTo="/profile" />
      </div>
    );
  }

  // Server-side: call backend directly, forwarding the visitor identity.
  const meRes = await fetch(`${BACKEND}/api/me`, {
    cache: "no-store",
    headers: { "X-Coders-User": codersId },
  });
  if (!meRes.ok) {
    return <p>Couldn’t load your profile (HTTP {meRes.status}).</p>;
  }
  const me = await meRes.json();

  const postsRes = await fetch(`${BACKEND}/api/users/${me.id}/posts`, {
    cache: "no-store",
  });
  const posts: Post[] = postsRes.ok ? await postsRes.json() : [];

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Profile</h1>
      <dl style={{ marginTop: ".5rem" }}>
        <dt style={{ opacity: 0.6, fontSize: ".88em" }}>display name</dt>
        <dd style={{ margin: ".25em 0 1em" }}>{me.display_name}</dd>
        <dt style={{ opacity: 0.6, fontSize: ".88em" }}>coders.kr id</dt>
        <dd style={{ margin: ".25em 0 1em", fontFamily: "ui-monospace" }}>
          {me.coders_id}
        </dd>
        <dt style={{ opacity: 0.6, fontSize: ".88em" }}>first seen</dt>
        <dd style={{ margin: ".25em 0 1em" }}>
          {new Date(me.first_seen_at).toLocaleString()}
        </dd>
      </dl>

      <h2 style={{ fontSize: "1.1rem", marginTop: "2rem" }}>Your posts</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {posts.length === 0 && (
          <li style={{ opacity: 0.6 }}>
            None yet — head to <Link href="/">the feed</Link> and write one.
          </li>
        )}
        {posts.map((p) => (
          <li
            key={p.id}
            style={{ padding: "1rem 0", borderBottom: "1px solid #e5e7eb" }}
          >
            <div style={{ fontSize: ".88em", opacity: 0.7 }}>
              {new Date(p.created_at).toLocaleString()}
            </div>
            <div style={{ marginTop: ".25rem" }}>{p.body}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
