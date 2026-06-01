import { signInHref, signOutHref } from "@/lib/identity";

export function SignInLink({ returnTo }: { returnTo?: string }) {
  return (
    <a
      href={signInHref(returnTo)}
      style={{
        display: "inline-block",
        padding: "0.5em 1em",
        background: "#0f172a",
        color: "white",
        borderRadius: 6,
        textDecoration: "none",
      }}
    >
      Sign in with coders.kr
    </a>
  );
}

export function SignOutLink({ returnTo }: { returnTo?: string }) {
  return (
    <a href={signOutHref(returnTo)} style={{ opacity: 0.7, fontSize: ".9em" }}>
      Sign out
    </a>
  );
}
