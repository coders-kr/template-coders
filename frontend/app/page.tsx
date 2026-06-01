import { fetchFeed } from "@/lib/api";
import { getCodersUser } from "@/lib/identity";
import { SignInLink } from "@/components/SignIn";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const codersId = await getCodersUser();
  const feed = await fetchFeed();

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Feed</h1>
      <p style={{ opacity: 0.7 }}>
        Anyone can read; signed-in visitors can post. The platform gate
        decides whether you can mutate — this app trusts the
        <code> X-Coders-User</code> header and never asks you to log in
        itself.
      </p>

      {codersId ? (
        <ComposeForm />
      ) : (
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "1rem",
            margin: "1rem 0",
          }}
        >
          <p style={{ margin: "0 0 .6rem" }}>Sign in to post.</p>
          <SignInLink returnTo="/" />
        </div>
      )}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {feed.length === 0 && (
          <li style={{ opacity: 0.6 }}>
            No posts yet. Be the first.
          </li>
        )}
        {feed.map((p) => (
          <li
            key={p.id}
            style={{
              padding: "1rem 0",
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            <div style={{ fontSize: ".9em", opacity: 0.7 }}>
              {p.author_name} ·{" "}
              {new Date(p.created_at).toLocaleString()}
            </div>
            <div style={{ marginTop: ".25rem" }}>{p.body}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComposeForm() {
  // Plain form post — no JS, no auth wiring. The gate already gated the
  // POST: anonymous would have been 302'd to /sso/login before reaching
  // Next.js, and the backend's require_identity() defends in depth.
  return (
    <form
      action="/api/posts"
      method="POST"
      encType="application/x-www-form-urlencoded"
      style={{
        background: "#f8fafc",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "1rem",
        margin: "1rem 0",
      }}
    >
      <label htmlFor="body" style={{ display: "block", marginBottom: ".5rem" }}>
        Post something
      </label>
      <textarea
        name="body"
        id="body"
        required
        maxLength={280}
        rows={3}
        style={{ width: "100%", boxSizing: "border-box" }}
      />
      <div style={{ marginTop: ".5rem", textAlign: "right" }}>
        <button
          type="submit"
          style={{
            padding: ".4em 1em",
            background: "#0f172a",
            color: "white",
            border: 0,
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Post
        </button>
      </div>
    </form>
  );
}
