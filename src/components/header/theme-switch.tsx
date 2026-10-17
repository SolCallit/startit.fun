"use client";

import { useSyncExternalStore } from "react";

const EVENT = "startit-theme";
const subscribe = (cb: () => void) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); };
const isLight = () => document.documentElement.dataset.theme === "light";

/** Dark / light switch. The choice is stored per browser; dark is the default. */
export function ThemeSwitch({ withLabel = false }: { withLabel?: boolean }) {
  // Reads the theme the inline script set before paint; the server renders "dark".
  const light = useSyncExternalStore(subscribe, isLight, () => false);

  function flip(next: boolean) {
    document.documentElement.dataset.theme = next ? "light" : "dark";
    window.dispatchEvent(new Event(EVENT));
    try { localStorage.setItem("startit-theme", next ? "light" : "dark"); } catch {}
  }

  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[0.9375rem] font-semibold text-ink-soft">
      {withLabel ? <span className="flex-1">Light theme</span> : <span className="sr-only">Light theme</span>}
      <span aria-hidden className="text-muted">{light ? <Sun /> : <Moon />}</span>
      <input type="checkbox" role="switch" className="switch" checked={light} onChange={(e) => flip(e.target.checked)} />
    </label>
  );
}

const Moon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
);
const Sun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
