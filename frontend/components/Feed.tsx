"use client";

import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createPost, fetchFeed, type Post } from "@/lib/api";
import { useMe } from "@/lib/identity";
import { SignInLink } from "./SignIn";

export function Feed() {
  const me = useMe();
  const [feed, setFeed] = useState<Post[] | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  useEffect(() => {
    fetchFeed().then(setFeed);
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = (form.elements.namedItem("body") as HTMLTextAreaElement).value
      .trim();
    if (!body || posting) return;
    setPostError(null);
    setPosting(true);
    try {
      const created = await createPost(body);
      form.reset();
      setFeed((existing) => (existing ? [created, ...existing] : [created]));
    } catch (err) {
      setPostError((err as Error).message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Feed</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Anyone can read. Signed-in visitors can post. The platform gate
          decides who can mutate — anonymous POSTs get bounced to{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            mcp.coders.kr/sso/login
          </code>{" "}
          before they reach this app.
        </p>
      </div>

      {me === undefined ? null : me ? (
        <Card>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-3">
              <label htmlFor="body" className="text-sm">
                Post as <strong>{me.display_name}</strong>
              </label>
              <textarea
                id="body"
                name="body"
                required
                maxLength={280}
                rows={3}
                placeholder="Say something."
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-destructive min-h-[1.2em]">
                  {postError ?? ""}
                </span>
                <Button type="submit" disabled={posting}>
                  {posting ? "Posting…" : "Post"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-sm">Sign in to post.</p>
            <SignInLink size="sm" />
          </CardContent>
        </Card>
      )}

      <ul className="space-y-1">
        {feed === null && (
          <li>
            <Skeleton className="h-16 w-full" />
          </li>
        )}
        {feed && feed.length === 0 && (
          <li className="py-3 text-sm text-muted-foreground">
            No posts yet. Be the first.
          </li>
        )}
        {feed?.map((p) => (
          <li
            key={p.id}
            className="border-b py-4 last:border-b-0"
          >
            <div className="text-xs text-muted-foreground">
              {p.author_name} · {new Date(p.created_at).toLocaleString()}
            </div>
            <div className="mt-1 text-sm">{p.body}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
