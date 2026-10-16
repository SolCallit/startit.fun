import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { Container } from "./ui";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75 sticky top-0 z-20">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex items-baseline gap-0.5 text-[1.25rem] font-bold tracking-[-0.03em] text-ink">
          startit<span className="text-cobalt">.fun</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-5 text-[0.9375rem] font-medium text-ink-soft">
          <Link href="/explore" className="hover:text-ink">Projects</Link>
          <Link href="/fees" className="hidden hover:text-ink sm:inline">Fees</Link>
          <Link href="/methodology" className="hidden hover:text-ink sm:inline">How we verify</Link>
          <Suspense fallback={<span className="w-16" aria-hidden />}>
            <AccountNav />
          </Suspense>
        </nav>
      </Container>
    </header>
  );
}

async function AccountNav() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href="/login" className="rounded-md bg-ink px-3.5 py-2 text-[0.875rem] font-semibold text-paper hover:opacity-90">
        Sign in
      </Link>
    );
  }
  return (
    <>
      {user.isStaff ? <Link href="/admin" className="hover:text-ink">Review queue</Link> : null}
      <Link href="/dashboard" className="hover:text-ink">My applications</Link>
      <form action={signOut}>
        <button type="submit" className="text-muted hover:text-ink">Sign out</button>
      </form>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <Container className="grid gap-6 py-10 text-[0.875rem] text-muted sm:grid-cols-[1fr_auto]">
        <p className="max-w-xl leading-relaxed">
          Tokens launched through Startit are speculative and can lose all value. Verification describes what we
          checked and when — it is not an endorsement, an audit, or a promise about a token&apos;s price.
        </p>
        <nav aria-label="Footer" className="flex gap-5">
          <Link href="/methodology" className="hover:text-ink">Methodology</Link>
          <Link href="/terms" className="hover:text-ink">Terms &amp; risks</Link>
        </nav>
      </Container>
    </footer>
  );
}
