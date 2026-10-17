"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

/** The START logo as a real button: it presses itself every few seconds, and presses when you tap it. */
export function StartButton({ href, label }: { href: string; label: string }) {
  const reduce = useReducedMotion();
  return (
    <Link href={href} aria-label={label} className="relative block shrink-0 rounded-full">
      <motion.span
        className="block"
        animate={reduce ? undefined : { scale: [1, 1, 0.9, 1.03, 1], y: [0, 0, 4, -1, 0] }}
        transition={{ duration: 3.2, times: [0, 0.72, 0.8, 0.9, 1], repeat: Infinity, ease: "easeInOut" }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.86, y: 5 }}
      >
        <motion.span
          aria-hidden
          className="absolute inset-[8%] rounded-full bg-[#d8ff3c]"
          animate={reduce ? undefined : { opacity: [0.15, 0.15, 0.6, 0.15], scale: [1, 1, 1.18, 1] }}
          transition={{ duration: 3.2, times: [0, 0.72, 0.82, 1], repeat: Infinity }}
          style={{ filter: "blur(16px)" }}
        />
        <Image src="/brand/startit-logo.png" alt="" width={128} height={128} priority
          className="relative size-[4.25rem] drop-shadow-[0_6px_10px_#000a] sm:size-[5.75rem]" />
      </motion.span>
    </Link>
  );
}
