import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/app/(site)/(auth)/actions";
import { Container } from "./ui";
import { WalletLogin } from "./wallet-login";
import { Tray } from "./header/tray";
import { ThemeSwitch } from "./header/theme-switch";
import { ProfilePanel } from "./header/profile-panel";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 glass-bar">
      <Container className="flex h-16 items-center gap-3">
        <Suspense fallback={<span className="size-10" aria-hidden />}>
          <TrayButton />
        </Suspense>
        <Brand />
        <nav aria-label="Main" className="ml-2 hidden items-center gap-1 text-[0.9375rem] font-semibold text-ink-soft md:flex">
          <Suspense fallback={<NavA href="/">Home</NavA>}>
            <HomeLink />
          </Suspense>
          <NavA href="/explore">Projects</NavA>
          <NavA href="/fees">Fees</NavA>
          <NavA href="/methodology">How we verify</NavA>
          <Suspense><SignedInLinks /></Suspense>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden sm:block"><ThemeSwitch /></span>
          <Suspense fallback={<span className="w-32" aria-hidden />}>
            <Account />
          </Suspense>
        </div>
      </Container>
    </header>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 rounded-full pr-2 font-display text-[1.375rem] font-extrabold tracking-[-0.03em] text-ink">
      <Image src="/brand/startit-logo-192.png" alt="" width={36} height={36} priority className="size-9 drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]" />
      <span className="hidden sm:inline">startit<span className="text-start">.fun</span></span>
    </Link>
  );
}

const NavA = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="rounded-full px-3 py-2 hover:bg-surface-2 hover:text-ink">{children}</Link>
);

async function TrayButton() {
  const user = await getCurrentUser();
  return <Tray signedIn={!!user} isStaff={!!user?.isStaff} />;
}

async function HomeLink() {
  const user = await getCurrentUser();
  return <NavA href={user ? "/home" : "/"}>Home</NavA>;
}

async function SignedInLinks() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <>
      <NavA href="/dashboard">My applications</NavA>
      {user.isStaff ? <NavA href="/admin">Review queue</NavA> : null}
    </>
  );
}

async function Account() {
  const user = await getCurrentUser();
  if (!user) return <WalletLogin variant="header" />;
  return <ProfilePanel label={user.displayName} wallet={user.walletAddress} signOut={signOut} />;
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <Container className="grid gap-6 py-10 text-[0.875rem] text-muted sm:grid-cols-[1fr_auto]">
        <p className="max-w-xl leading-relaxed">
          Tokens launched through Startit are speculative and can lose all value. A verification report says what we
          checked and when. It isn&apos;t an endorsement, an audit or a promise about price.
        </p>
        <nav aria-label="Footer" className="flex gap-5">
          <Link href="/methodology" className="hover:text-ink">Methodology</Link>
          <Link href="/terms" className="hover:text-ink">Terms and risks</Link>
        </nav>
      </Container>
    </footer>
  );
}
