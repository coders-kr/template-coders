"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchUserPosts, type Post } from "@/lib/api";
import { useMe } from "@/lib/identity";
import { SignInLink } from "./SignIn";

export function Profile() {
  const me = useMe();
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
    if (!me) return;
    fetchUserPosts(me.id).then(setPosts);
  }, [me]);

  if (me === undefined) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (me === null) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          You need to sign in to see this page.
        </p>
        <SignInLink returnTo="/profile" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>

      <Card>
        <CardContent>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-3 text-sm">
            <dt className="text-muted-foreground">display name</dt>
            <dd>{me.display_name}</dd>
            <dt className="text-muted-foreground">coders.kr id</dt>
            <dd className="font-mono text-xs">{me.coders_id}</dd>
            <dt className="text-muted-foreground">first seen</dt>
            <dd>{new Date(me.first_seen_at).toLocaleString()}</dd>
          </dl>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Your posts
        </h2>
        <ul className="space-y-1">
          {posts === null && (
            <li>
              <Skeleton className="h-16 w-full" />
            </li>
          )}
          {posts && posts.length === 0 && (
            <li className="text-sm text-muted-foreground">
              None yet — head to{" "}
              <Link href="/" className="underline-offset-4 hover:underline">
                the feed
              </Link>{" "}
              and write one.
            </li>
          )}
          {posts?.map((p) => (
            <li
              key={p.id}
              className="border-b py-4 last:border-b-0"
            >
              <div className="text-xs text-muted-foreground">
                {new Date(p.created_at).toLocaleString()}
              </div>
              <div className="mt-1 text-sm">{p.body}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
