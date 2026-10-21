"use client";

import { motion } from "motion/react";

const WHO = [
  { t: "Crypto", c: "#2ee5ff" }, { t: "Web2", c: "#ff9cf6" }, { t: "Viral", c: "#d8ff3c" }, { t: "Not viral yet", c: "#ffd23f" },
  { t: "Solo builders", c: "#2ee5ff" }, { t: "Teams", c: "#ff9cf6" }, { t: "Artists", c: "#d8ff3c" }, { t: "Developers", c: "#ffd23f" },
  { t: "Content creators", c: "#ff6a6f" },
];

/** Who can launch here: one bouncy row of tags. */
export function WelcomeChips({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`} aria-label="Everyone's welcome">
      {WHO.map((w, i) => (
        <motion.li key={w.t}
          initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 22, delay: 0.05 * i }}
          whileHover={{ y: -3, rotate: i % 2 ? 2 : -2 }}
          className="welcome-chip rounded-full border px-3 py-1 text-[0.875rem] font-bold"
          style={{ borderColor: `${w.c}99`, color: w.c, background: `${w.c}14`, textShadow: "0 1px 0 #0006" }}>
          {w.t}
        </motion.li>
      ))}
    </ul>
  );
}
