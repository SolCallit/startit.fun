"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";

/**
 * The START button is the ignition: press it and the ring lights up, the button kicks like an engine catching,
 * then you're taken to your application. It breathes softly while idle.
 */
export function StartButton({ href, label, hint, action }: { href: string; label: string; hint: string; action?: () => Promise<void> }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const body = useAnimationControls();
  const [state, setState] = useState<"idle" | "starting">("idle");

  useEffect(() => { router.prefetch(href); }, [router, href]);

  const ignite = async () => {
    if (state === "starting") return;
    setState("starting");
    if (!reduce) {
      await body.start({ scale: 0.84, y: 6, transition: { duration: 0.12 } });
      await body.start({ x: [0, -3, 3, -2, 2, -1, 1, 0], scale: 1.04, y: 0, transition: { duration: 0.45 } });
      await body.start({ scale: 1, transition: { type: "spring", stiffness: 300, damping: 14 } });
    }
    if (action) await action(); // creates the application and redirects into it
    else router.push(href);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <button type="button" onClick={ignite} aria-label={label} className="group relative grid place-items-center rounded-full outline-offset-8">
        {/* Ignition ring: sweeps green → cyan → yellow when starting, breathes when idle. */}
        <motion.span
          aria-hidden
          className="absolute -inset-5 rounded-full"
          style={{ background: "conic-gradient(from 0deg, #2fe66a, #2cc8ff, #ffd02e, #e3232e, #2fe66a)", filter: "blur(18px)" }}
          animate={state === "starting" ? { opacity: [0.2, 1, 0.9], rotate: [0, 360], scale: [0.9, 1.15, 1.05] }
            : reduce ? { opacity: 0.35 } : { opacity: [0.22, 0.5, 0.22], scale: [0.96, 1.04, 0.96] }}
          transition={state === "starting" ? { duration: 0.7, ease: "easeOut" } : { duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span animate={body} whileHover={state === "idle" ? { scale: 1.05 } : undefined} whileTap={state === "idle" ? { scale: 0.88, y: 5 } : undefined} className="relative block">
          <Image src="/brand/startit-logo.png" alt="" width={192} height={192} priority
            className="size-[8.5rem] drop-shadow-[0_14px_22px_#000c] sm:size-[10.5rem]" />
        </motion.span>
      </button>
      <motion.p key={state} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-[0.9375rem] font-bold tracking-wide text-white">
        {state === "starting" ? "Starting…" : label}
      </motion.p>
      <p className="-mt-2 text-[0.8125rem] text-white/60">{hint}</p>
    </div>
  );
}
