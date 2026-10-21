"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet } from "./sheet";
import { ThemeSwitch } from "./theme-switch";

type Item = { href: string; label: string };

/** Hamburger beside the brand: opens and closes the navigation tray. */
export function Tray({ signedIn, isStaff }: { signedIn: boolean; isStaff: boolean }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  // Close the tray after navigating (adjusting state during render, not in an effect).
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) { setLastPath(path); setOpen(false); }

  const main: Item[] = [
    ...(signedIn ? [{ href: "/home", label: "Home" }] : [{ href: "/", label: "Home" }]),
    { href: "/explore", label: "Projects" },
    { href: "/apply", label: "Apply to launch" },
    ...(signedIn ? [{ href: "/dashboard", label: "My applications" }] : []),
    ...(isStaff ? [{ href: "/admin", label: "Admin · Review queue" }, { href: "/admin/settings", label: "Admin · Platform settings" }] : []),
  ];
  const more: Item[] = [
    { href: "/about", label: "About us" },
    { href: "/fees", label: "Fees and payouts" },
    { href: "/methodology", label: "How we verify" },
    { href: "/terms", label: "Terms and risks" },
  ];

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-10 place-items-center rounded-full text-ink hover:bg-surface-2"
      >
        <Burger open={open} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} side="left" label="Menu">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="font-display text-[1.25rem] font-extrabold">Menu</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="grid size-9 place-items-center rounded-full hover:bg-surface-2">
            <Burger open />
          </button>
        </div>
        <nav aria-label="Menu" className="flex flex-col gap-1 px-3 py-4">
          {main.map((i) => <TrayLink key={i.href} {...i} on={path === i.href} />)}
        </nav>
        <div className="mx-5 border-t border-line" />
        <nav aria-label="More" className="flex flex-col gap-1 px-3 py-4">
          {more.map((i) => <TrayLink key={i.href} {...i} on={path === i.href} quiet />)}
        </nav>
        <div className="mt-auto border-t border-line px-5 py-4">
          <ThemeSwitch withLabel />
        </div>
      </Sheet>
    </>
  );
}

function TrayLink({ href, label, on, quiet }: Item & { on: boolean; quiet?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`flex items-center justify-between rounded-[14px] px-3 py-2.5 hover:bg-surface-2 ${on ? "bg-surface-2 font-extrabold text-ink" : quiet ? "font-medium text-ink-soft" : "font-semibold text-ink"}`}
    >
      {label}
      {on ? <span aria-hidden className="size-2 rounded-full bg-cobalt shadow-[0_0_8px_var(--cobalt)]" /> : null}
    </Link>
  );
}

function Burger({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h10" />}
    </svg>
  );
}
