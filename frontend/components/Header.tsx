"use client";

import Link from "next/link";

import { useMe } from "@/lib/identity";
import { SignInLink, SignOutLink } from "./SignIn";

export function Header() {
  const me = useMe();

  return (
    <header className="flex items-center justify-between border-b py-4 mb-6">
      <Link
        href="/"
        className="text-base font-semibold tracking-tight hover:text-muted-foreground"
      >
        template-coders
      </Link>
      <nav className="flex items-center gap-4">
        {me === undefined ? (
          // Reserve a slot so the page doesn't reflow when identity resolves.
          <span aria-hidden className="opacity-0">·</span>
        ) : me ? (
          <>
            <Link
              href="/profile"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {me.display_name}
            </Link>
            <SignOutLink />
          </>
        ) : (
          <SignInLink size="sm" />
        )}
      </nav>
    </header>
  );
}
