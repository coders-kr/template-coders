import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";

import { Header } from "@/components/Header";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata = {
  title: "template-coders",
  description: "A coders.kr-aware SPA starter.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>
        <div className="mx-auto max-w-3xl px-6 sm:px-8 pb-16">
          <Header />
          <main>{children}</main>
          <footer className="mt-16 border-t pt-5 text-sm text-muted-foreground">
            Hosted on{" "}
            <a
              href="https://coders.kr"
              className="underline-offset-4 hover:underline"
            >
              coders.kr
            </a>{" "}
            — identity and metering handled by the platform; this app
            reads{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              X-Coders-User
            </code>{" "}
            on the backend and learns who you are on the frontend by
            fetching{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              /api/me
            </code>
            .
          </footer>
        </div>
      </body>
    </html>
  );
}
