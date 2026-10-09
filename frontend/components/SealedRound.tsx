"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useT } from "@/lib/i18n";

/**
 * The hero's picture of the mechanism, beside the sentence that claims it.
 *
 * Founders on one side, builders on the other, every ranking travelling into
 * the enclave as a spark and none coming back out. What leaves the hexagon is
 * only the pairings, one at a time. It is an illustration — the labels are
 * placeholders, not people — so it carries no numbers that could be mistaken
 * for data.
 */

const ROWS = [62, 118, 174, 230];
const HEX = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
  return `${180 + Math.cos(a) * 56},${146 + Math.sin(a) * 56}`;
}).join(" ");
const PAIRS = ["F1 · B3", "F2 · B1", "F3 · B4", "F4 · B2"];

export function SealedRound() {
  const t = useT();
  const reduce = useReducedMotion();

  const spark = (fromX: number, y: number, i: number, side: "l" | "r") => {
    const dx = 180 - fromX;
    const dy = 146 - y;
    return (
      <motion.circle
        key={`${side}${i}`}
        cx={fromX}
        cy={y}
        r={3}
        className="fill-sealed"
        initial={{ x: 0, y: 0, opacity: 0 }}
        animate={
          reduce
            ? { x: dx * 0.5, y: dy * 0.5, opacity: 0.8 }
            : { x: [0, dx * 0.82], y: [0, dy * 0.82], opacity: [0, 1, 1, 0] }
        }
        transition={
          reduce
            ? { duration: 0 }
            : {
                duration: 2.4,
                delay: 0.8 + i * 0.45 + (side === "r" ? 0.22 : 0),
                repeat: Infinity,
                repeatDelay: 1.4,
                ease: [0.4, 0, 0.6, 1],
              }
        }
      />
    );
  };

  return (
    <motion.figure
      aria-hidden
      className="pointer-events-none select-none"
      initial={reduce ? false : { opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 160, damping: 22, delay: 0.25 }}
    >
      <svg viewBox="0 0 360 330" className="h-auto w-full overflow-visible">
        <text x="17" y="26" textAnchor="start" className="fill-open font-mono text-[12px] uppercase tracking-[0.14em]">
          {t.hero.proposers.split(" ")[0]}
        </text>
        <text x="343" y="26" textAnchor="end" className="fill-open font-mono text-[12px] uppercase tracking-[0.14em]">
          {t.hero.receivers.split(" ")[0]}
        </text>

        {ROWS.map((y, i) => (
          <g key={y}>
            <line x1="30" y1={y} x2="180" y2="146" className="stroke-edgeStrong" strokeDasharray="2 5" />
            <line x1="330" y1={y} x2="180" y2="146" className="stroke-edgeStrong" strokeDasharray="2 5" />
            <circle cx="30" cy={y} r="13" className="fill-surface stroke-open" strokeWidth="1.5" />
            <circle cx="330" cy={y} r="13" className="fill-surface stroke-open" strokeWidth="1.5" />
            <text x="30" y={y + 4} textAnchor="middle" className="fill-chalk font-mono text-[12px]">F{i + 1}</text>
            <text x="330" y={y + 4} textAnchor="middle" className="fill-chalk font-mono text-[12px]">B{i + 1}</text>
          </g>
        ))}

        {ROWS.map((y, i) => spark(30, y, i, "l"))}
        {ROWS.map((y, i) => spark(330, y, i, "r"))}

        {/* The enclave: turns slowly, never opens. */}
        <motion.g
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
        >
          <polygon points={HEX} className="fill-bg stroke-sealed" strokeWidth="1.6" />
          <polygon points={HEX} className="fill-sealed" fillOpacity={0.1} transform="translate(180 146) scale(0.78) translate(-180 -146)" />
        </motion.g>
        {/* Padlock */}
        <g className="stroke-sealed" strokeWidth="2" fill="none" strokeLinecap="round">
          <rect x="167" y="142" width="26" height="20" rx="4" />
          <path d="M172 142v-6a8 8 0 0 1 16 0v6" />
        </g>
        <text x="180" y="222" textAnchor="middle" className="fill-sealed font-mono text-[12px] uppercase tracking-[0.18em]">
          {t.hero.sealed}
        </text>

        {/* Only the pairings leave. */}
        {PAIRS.map((p, i) => (
          <motion.g
            key={p}
            initial={reduce ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 + i * 0.35, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <rect x={18 + i * 84} y="270" width="72" height="28" rx="8" className="fill-surface stroke-settled" strokeWidth="1.2" />
            <text x={54 + i * 84} y="289" textAnchor="middle" className="fill-chalk font-mono text-[12px]">{p}</text>
          </motion.g>
        ))}
      </svg>
    </motion.figure>
  );
}
