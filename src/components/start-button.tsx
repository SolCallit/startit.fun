"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";

/**
 * The START button is the ignition. Idle, it pulses like it's waiting to be pressed. Pressed, it kicks like an engine
 * catching and the ring lights up, while the application opens in parallel, so there's no waiting on the animation.
 */
export function StartButton({ href, label, hint, action }: { href: string; label: string; hint: string; action?: () => Promise<void> }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const body = useAnimationControls();
  const [starting, setStarting] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => { router.prefetch(href); }, [router, href]);
  useEffect(() => {
    if (reduce || starting) return;
    body.start({ scale: [1, 1.045, 1], transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" } });
  }, [body, reduce, starting]);

  const ignite = () => {
    if (starting) return;
    setStarting(true);
    // Navigate immediately; the kick plays while the next page loads.
    startTransition(async () => {
      if (action) await action();
      else router.push(href);
    });
    if (!reduce) {
      body.stop();
      void body.start({ scale: [1, 0.86, 1.05, 1], x: [0, -3, 3, -2, 2, 0], transition: { duration: 0.42 } });
    }
  };

  return (
    <div className="flex flex-col items-center gap-2.5">
      <button type="button" onClick={ignite} aria-label={label} aria-busy={starting} className="relative grid place-items-center rounded-full outline-offset-8">
        <motion.span
          aria-hidden
          className="absolute -inset-4 rounded-full"
          style={{ background: "conic-gradient(from 0deg, #2fe66a, #2cc8ff, #ffd02e, #e3232e, #2fe66a)", filter: "blur(16px)" }}
          animate={starting ? { opacity: [0.6, 1, 0.6], rotate: [0, 360], scale: [1, 1.15, 1] }
            : reduce ? { opacity: 0.35 } : { opacity: [0.25, 0.6, 0.25], scale: [0.95, 1.06, 0.95] }}
          transition={starting ? { duration: 0.9, repeat: Infinity, ease: "linear" } : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span animate={body} whileTap={starting ? undefined : { scale: 0.88, y: 4 }} className="relative block">
          <Image src="/brand/startit-logo.png" alt="" width={160} height={160} priority
            className="size-[6.25rem] drop-shadow-[0_12px_18px_#000c] sm:size-[8rem]" />
        </motion.span>
      </button>
      <motion.p key={String(starting)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-[0.9375rem] font-bold tracking-wide text-white">
        {starting ? "Starting your engine…" : label}
      </motion.p>
      <p className="-mt-1.5 text-[0.8125rem] text-white/60">{hint}</p>
    </div>
  );
}
