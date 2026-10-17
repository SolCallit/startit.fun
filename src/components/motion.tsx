"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

/** Fades and lifts its children in when they scroll into view. */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ type: "spring", stiffness: 210, damping: 26, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Springy hover lift for cards. */
export function Lift({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} whileHover={{ y: -4, scale: 1.01 }} whileTap={{ scale: 0.985 }} transition={{ type: "spring", stiffness: 420, damping: 28 }}>
      {children}
    </motion.div>
  );
}
