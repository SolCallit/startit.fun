"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Side sheet on a native <dialog>: focus trap, Esc to close, backdrop click to close. */
export function Sheet({ open, onClose, side, label, children }: { open: boolean; onClose: () => void; side: "left" | "right"; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={`sheet sheet-${side} fixed top-0 m-0 h-dvh max-h-dvh w-[min(23rem,calc(100vw-2.5rem))] max-w-none border-line bg-paper p-0 text-ink backdrop:bg-black/50 backdrop:backdrop-blur-[2px] ${side === "left" ? "left-0 border-r" : "right-0 left-auto border-l"}`}
    >
      <div className="flex h-full flex-col overflow-y-auto">{children}</div>
    </dialog>
  );
}
