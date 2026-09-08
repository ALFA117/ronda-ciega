"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { useOnScreen } from "@/hooks/useOnScreen";

/**
 * The commit-reveal argument as one split figure rather than two cards. The
 * asymmetry is the message: the losing column is struck through, the winning
 * one carries the accent, and a single rule separates them.
 */
export function CompareColumns() {
  const t = useT();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const shown = useOnScreen(ref, 80);

  const cols = [
    { ...t.compare.commitReveal, ok: false },
    { ...t.compare.privateEr, ok: true },
  ];

  return (
    <div
      ref={ref}
      className="grid overflow-hidden rounded-2xl border border-edge sm:grid-cols-2"
    >
      {cols.map((c, i) => (
        <motion.div
          key={c.title}
          initial={reduce ? undefined : { y: 16 }}
          animate={reduce || shown ? { y: 0 } : undefined}
          transition={{ duration: 0.45, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
          className={`flex flex-col p-6 sm:p-8 ${
            c.ok
              ? "sealed-hatch bg-sealed/[0.045] sm:border-l sm:border-edge"
              : "border-b border-edge bg-surface/40 sm:border-b-0"
          }`}
        >
          <h3
            className={`font-mono text-xs uppercase tracking-[0.16em] ${
              c.ok ? "text-sealed" : "text-muted"
            }`}
          >
            {c.title}
          </h3>

          <ul className="mt-6 flex-1 space-y-3.5">
            {c.points.map((p, j) => {
              const isVerdictLine = j === c.points.length - 1;
              return (
                <li key={j} className="flex gap-3 text-sm leading-relaxed">
                  <span
                    className={`mt-[0.55em] h-px w-3 shrink-0 ${
                      c.ok ? "bg-sealed" : "bg-edgeStrong"
                    }`}
                    aria-hidden
                  />
                  <span
                    className={
                      isVerdictLine
                        ? c.ok
                          ? "text-chalk"
                          : "text-chalk line-through decoration-edgeStrong decoration-1"
                        : "text-muted"
                    }
                  >
                    {p}
                  </span>
                </li>
              );
            })}
          </ul>

          <p
            className={`mt-8 border-t pt-5 font-mono text-2xs leading-relaxed ${
              c.ok ? "border-sealed/25 text-sealed" : "border-edge text-muted"
            }`}
          >
            {c.verdict}
          </p>
        </motion.div>
      ))}
    </div>
  );
}
