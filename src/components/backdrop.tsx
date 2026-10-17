"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";

/**
 * The pillar field: isometric columns (coral tops, pink → cyan faces fading into the dark) that rise and fall
 * in a slow diagonal wave, and lean a little toward the pointer. Decorative, fixed, behind everything.
 */

const W = 1440, H = 900;          // design space
const HALF = 66, RISE = 38;       // half-width of a column, height of the top diamond's half
type Pillar = { x: number; y: number; len: number; amp: number; dur: number; delay: number; z: number };

// Deterministic layout so server and client render the same field.
function layout(): Pillar[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out: Pillar[] = [];
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 16; j++) {
      const x = W / 2 + (i - j) * HALF * 1.32 - HALF;
      const y = -220 + (i + j) * RISE * 1.32 + (rnd() - 0.5) * 90;
      if (x < -HALF * 2 || x > W || y > 420 || y < -320) continue;
      out.push({
        x, y,
        len: 460 + rnd() * 360,
        amp: 14 + rnd() * 46,
        dur: 7 + rnd() * 5,
        delay: -((i - j + 16) * 0.42 + rnd() * 0.8),
        z: i + j,
      });
    }
  }
  return out.sort((a, b) => a.z - b.z || a.y - b.y);
}
const PILLARS = layout();

function Column({ len }: { len: number }) {
  const w = HALF * 2, t = RISE * 2;
  return (
    <svg viewBox={`0 0 ${w} ${len + t}`} width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
      <path d={`M0 ${RISE} L${HALF} ${t} L${HALF} ${t + len} L0 ${RISE + len} Z`} fill="url(#pf-left)" />
      <path d={`M${HALF} ${t} L${w} ${RISE} L${w} ${RISE + len} L${HALF} ${t + len} Z`} fill="url(#pf-right)" />
      <path d={`M0 ${RISE} L${HALF} 0 L${w} ${RISE} L${HALF} ${t} Z`} fill="url(#pf-top)" />
    </svg>
  );
}

export function Backdrop() {
  const reduce = useReducedMotion();
  const px = useMotionValue(0), py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 40, damping: 18 }), sy = useSpring(py, { stiffness: 40, damping: 18 });
  const x = useTransform(sx, (v) => v * -18), y = useTransform(sy, (v) => v * -12);

  useEffect(() => {
    if (reduce) return;
    const move = (e: PointerEvent) => { px.set(e.clientX / window.innerWidth - 0.5); py.set(e.clientY / window.innerHeight - 0.5); };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [reduce, px, py]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-paper">
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="pf-right" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f2583c" />
            <stop offset="0.12" stopColor="#f2583c" />
            <stop offset="0.3" stopColor="#ff9cf6" />
            <stop offset="0.5" stopColor="#00f0ff" />
            <stop offset="0.66" stopColor="#00c8d4" stopOpacity="0.6" />
            <stop offset="0.85" stopColor="#003c44" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="pf-left" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f77ea4" />
            <stop offset="0.2" stopColor="#ff9cf6" />
            <stop offset="0.42" stopColor="#2deaff" />
            <stop offset="0.7" stopColor="#00b8c4" stopOpacity="0.5" />
            <stop offset="0.82" stopColor="#003c44" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="pf-top" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#f2583c" />
            <stop offset="0.45" stopColor="#ff8fd8" />
            <stop offset="1" stopColor="#ffa6fb" />
          </linearGradient>
        </defs>
      </svg>

      <motion.div
        style={{ x, y }}
        className="absolute top-0 left-1/2 aspect-[1440/900] w-[max(100vw,160vh)] -translate-x-1/2 opacity-[var(--field-opacity)]"
      >
        {PILLARS.map((p, k) => (
          <div
            key={k}
            className="pillar"
            style={{
              left: `${(p.x / W) * 100}%`,
              top: `${(p.y / H) * 100}%`,
              width: `${((HALF * 2) / W) * 100}%`,
              height: `${((p.len + RISE * 2) / H) * 100}%`,
              ["--amp" as string]: `${p.amp}px`,
              ["--dur" as string]: `${p.dur}s`,
              ["--delay" as string]: `${p.delay}s`,
            }}
          >
            <Column len={p.len} />
          </div>
        ))}
      </motion.div>

      {/* Settle the field into the page: darker toward the bottom, a soft veil behind the content column. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--paper)_30%,transparent)_0%,color-mix(in_oklab,var(--paper)_40%,transparent)_55%,var(--paper)_92%)]" />
      <div className="absolute inset-0 bg-paper/45 sm:hidden" />
      <div className="absolute inset-0 bg-[radial-gradient(55%_60%_at_22%_55%,color-mix(in_oklab,var(--paper)_55%,transparent),transparent_80%)]" />
    </div>
  );
}
