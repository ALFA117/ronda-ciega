"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { springLayout } from "@/lib/motion";
import { NONE } from "@/lib/constants";

const ROW = 46;
/** Where the wire leaves one column and enters the other. */
const X1 = 36;
const X2 = 64;

export interface GraphNode {
  label: string;
  you?: boolean;
}

/**
 * Two columns of people with a wire drawn between each tentative pair.
 *
 * The wires are the whole point of the visual, so they get the motion: one
 * draws itself in when a proposal is accepted and retracts when the proposer is
 * displaced. Everything else stays still — two competing animations in one view
 * read as chaos rather than as an algorithm resolving.
 *
 * The endpoint dots matter more than they look: without them the wires float in
 * the gutter and stop reading as connections to the names beside them.
 */
export function MatchGraph({
  left,
  right,
  pairs,
  compact = false,
}: {
  left: GraphNode[];
  right: GraphNode[];
  /** pairs[i] = index in `right`, or NONE. */
  pairs: number[];
  compact?: boolean;
}) {
  const reduce = useReducedMotion();
  const rows = Math.max(left.length, right.length);
  const height = rows * ROW;
  const yOf = (i: number) => i * ROW + ROW / 2;

  const links = left
    .map((_, i) => ({ from: i, to: pairs[i] }))
    .filter((l) => l.to !== NONE && l.to !== undefined && l.to < right.length);

  const rightMatched = new Set(links.map((l) => l.to));

  return (
    <div className="relative w-full" style={{ height }}>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <AnimatePresence>
          {links.map((l) => (
            <motion.g
              // Keyed by both ends: re-pairing retracts the old wire and draws a
              // new one instead of sliding an endpoint across.
              key={`${l.from}-${l.to}`}
              initial={reduce ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <motion.line
                x1={`${X1}%`}
                x2={`${X2}%`}
                y1={yOf(l.from)}
                y2={yOf(l.to)}
                stroke="var(--sealed)"
                strokeWidth={1.25}
                strokeLinecap="round"
                initial={reduce ? undefined : { pathLength: 0 }}
                animate={reduce ? undefined : { pathLength: 1 }}
                exit={reduce ? undefined : { pathLength: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                style={{ opacity: 0.9 }}
              />
              <motion.circle
                cx={`${X1}%`}
                cy={yOf(l.from)}
                r={2.5}
                fill="var(--sealed)"
                initial={reduce ? undefined : { scale: 0 }}
                animate={reduce ? undefined : { scale: 1 }}
                exit={reduce ? undefined : { scale: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
              />
              <motion.circle
                cx={`${X2}%`}
                cy={yOf(l.to)}
                r={2.5}
                fill="var(--sealed)"
                initial={reduce ? undefined : { scale: 0 }}
                animate={reduce ? undefined : { scale: 1 }}
                exit={reduce ? undefined : { scale: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 420,
                  damping: 22,
                  delay: reduce ? 0 : 0.28,
                }}
              />
            </motion.g>
          ))}
        </AnimatePresence>
      </svg>

      <div
        className="absolute inset-0 grid"
        style={{ gridTemplateColumns: `${X1}% ${X2 - X1}% ${100 - X2}%` }}
      >
        <Column
          nodes={left}
          align="right"
          matched={(i) => links.some((l) => l.from === i)}
          compact={compact}
        />
        <div />
        <Column
          nodes={right}
          align="left"
          matched={(i) => rightMatched.has(i)}
          compact={compact}
        />
      </div>
    </div>
  );
}

function Column({
  nodes,
  align,
  matched,
  compact,
}: {
  nodes: GraphNode[];
  align: "left" | "right";
  matched: (i: number) => boolean;
  compact: boolean;
}) {
  return (
    <div>
      {nodes.map((n, i) => {
        const on = matched(i);
        return (
          <div key={`${n.label}-${i}`} className="flex items-center" style={{ height: ROW }}>
            <motion.span
              layout
              transition={springLayout}
              className={`flex w-full items-center gap-1.5 truncate font-mono ${
                compact ? "text-xs" : "text-sm"
              } ${
                align === "right" ? "justify-end pr-3" : "justify-start pl-3"
              } transition-colors duration-300 ${
                on ? "text-chalk" : "text-muted/50"
              }`}
            >
              {n.label}
              {n.you && <span className="text-2xs text-sealed">tú</span>}
            </motion.span>
          </div>
        );
      })}
    </div>
  );
}
