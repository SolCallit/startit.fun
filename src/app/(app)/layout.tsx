import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/app/(site)/(auth)/actions";
import { NavLink } from "./nav-link";
import { IconCoins, IconFolder, IconGrid, IconHome, IconInbox, IconRocket, IconShield } from "./icons";

/** Signed-in app shell (Call-It layout): sidebar + content. Collapses to a top bar on small screens. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside aria-label="Main navigation" className="sticky top-0 hidden h-dvh flex-col border-r border-line px-3.5 py-4 lg:flex">
        <Brand />
        <nav className="mt-5 flex flex-col gap-0.5">
          <NavLink href="/home" icon={<IconHome />}>Home</NavLink>
          <NavLink href="/explore" icon={<IconGrid />}>Projects</NavLink>
          <NavLink href="/apply" icon={<IconRocket />}>Apply to launch</NavLink>
          <NavLink href="/dashboard" icon={<IconFolder />}>My applications</NavLink>
          <NavLink href="/fees" icon={<IconCoins />}>Fees</NavLink>
          <NavLink href="/methodology" icon={<IconShield />}>How we verify</NavLink>
          <Suspense><StaffLink /></Suspense>
        </nav>
        <div className="flex-1" />
        <Suspense><Account /></Suspense>
      </aside>

      <div className="min-w-0">
        <div className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line bg-paper/90 px-4 backdrop-blur lg:hidden">
          <Brand />
          <nav aria-label="Main" className="ml-auto flex gap-4 overflow-x-auto text-[0.9375rem] font-semibold text-ink-soft">
            <Link href="/explore">Projects</Link>
            <Link href="/apply">Apply</Link>
            <Link href="/dashboard">Mine</Link>
          </nav>
        </div>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/home" className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 font-display text-[1.5rem] font-extrabold tracking-[-0.03em] text-ink hover:bg-surface-2">
      <span aria-hidden className="grid size-8 place-items-center rounded-[10px] bg-cobalt text-[1.05rem] text-cobalt-ink shadow-raise-sm">s</span>
      startit<span className="-ml-2 text-cobalt">.fun</span>
    </Link>
  );
}

async function StaffLink() {
  const user = await getCurrentUser();
  return user?.isStaff ? <NavLink href="/admin" icon={<IconInbox />}>Review queue</NavLink> : null;
}

async function Account() {
  const user = await getCurrentUser();
  if (!user) return null;
  const label = user.walletAddress ? `${user.walletAddress.slice(0, 4)}…${user.walletAddress.slice(-4)}` : user.displayName;
  return (
    <div className="flex items-center gap-3 rounded-full border-[1.5px] border-line bg-surface p-1.5 pr-2 shadow-raise-sm">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-cobalt-soft font-display font-extrabold text-cobalt">
        {label.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[0.875rem] text-ink" title={user.walletAddress ?? user.email ?? undefined}>{label}</span>
        <span className="block text-[0.75rem] text-muted">{user.isStaff ? "Operator" : "Founder account"}</span>
      </span>
      <form action={signOut}>
        <button type="submit" className="rounded-full px-2.5 py-1.5 text-[0.8125rem] font-semibold text-muted hover:bg-surface-2 hover:text-ink">
          {user.walletAddress ? "Disconnect" : "Sign out"}
        </button>
      </form>
    </div>
  );
}
