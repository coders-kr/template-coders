import type { ReactNode } from "react";
import Link from "next/link";

import { fetchMe } from "@/lib/api";
import { getCodersUser } from "@/lib/identity";
import { SignInLink, SignOutLink } from "@/components/SignIn";

export const metadata = {
  title: "template-coders",
  description: "A coders.kr-aware starter app.",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const codersId = await getCodersUser();
  const me = codersId ? await fetchMe(codersId) : null;

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: "44rem",
          margin: "0 auto",
          padding: "0 1rem",
          lineHeight: 1.5,
          color: "#0f172a",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1.25rem 0",
            borderBottom: "1px solid #e5e7eb",
            marginBottom: "1.5rem",
          }}
        >
          <Link
            href="/"
            style={{ fontSize: "1.15rem", fontWeight: 600, color: "inherit", textDecoration: "none" }}
          >
            template-coders
          </Link>
          <nav style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            {me ? (
              <>
                <Link href="/profile" style={{ color: "inherit" }}>
                  {me.display_name}
                </Link>
                <SignOutLink returnTo="/" />
              </>
            ) : (
              <SignInLink returnTo="/" />
            )}
          </nav>
        </header>
        <main>{children}</main>
        <footer
          style={{
            marginTop: "3rem",
            padding: "1.25rem 0",
            borderTop: "1px solid #e5e7eb",
            fontSize: ".88rem",
            opacity: 0.7,
          }}
        >
          Hosted on <a href="https://coders.kr">coders.kr</a> — identity and
          metering handled by the platform; this app reads <code>X-Coders-User</code>.
        </footer>
      </body>
    </html>
  );
}
