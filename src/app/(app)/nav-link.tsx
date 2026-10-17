"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const on = path === href || (href !== "/" && path.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`flex items-center gap-3.5 rounded-full px-3 py-2.5 text-[1rem] hover:bg-surface-2 ${on ? "font-extrabold text-ink [&_svg]:text-cobalt" : "font-medium text-ink-soft"}`}
    >
      <span className="grid size-6 place-items-center">{icon}</span>
      <span>{children}</span>
    </Link>
  );
}
