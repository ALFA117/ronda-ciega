"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Lock, UserPlus, Zap } from "lucide-react";
import { useT } from "@/lib/i18n";
import { stagger, riseIn } from "@/lib/motion";
import { useOnScreen } from "@/hooks/useOnScreen";

const ICONS = [UserPlus, Lock, Zap, Check];

/**
 * Where each step happens is the point of the diagram, so the boundary between
 * L1 and the enclave is drawn as an actual boundary rather than described in a
 * sentence: the two middle steps sit inside a marked, hatched region.
 */
export function FlowDiagram() {
  const t = useT();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLOListElement>(null);
  const shown = useOnScreen(ref);

  return (
    <motion.ol
      ref={ref}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      variants={reduce ? undefined : stagger()}
      initial={reduce ? undefined : "hidden"}
      animate={reduce || shown ? "show" : "hidden"}
    >
      {t.solution.steps.map((s, i) => {
        const Icon = ICONS[i];
        const inside = i === 1 || i === 2;
        return (
          <motion.li
            key={s.title}
            variants={reduce ? undefined : riseIn}
            className={`relative space-y-3 rounded-xl border p-5 ${
              inside
                ? "border-sealed/30 sealed-hatch bg-surface/60"
                : "border-edge bg-surface/70"
            }`}
          >
            <div className="flex items-center justify-between">
              <Icon
                className={`h-4 w-4 ${inside ? "text-sealed" : "text-muted"}`}
                aria-hidden
              />
              <span className="tnum font-mono text-2xs text-muted">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="text-sm font-medium">{s.title}</h3>
            <p className="text-xs leading-relaxed text-muted">{s.body}</p>
            {inside && (
              <span className="inline-block rounded border border-sealed/40 px-1.5 py-0.5 font-mono text-[10px] text-sealed">
                enclave
              </span>
            )}
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

/**
 * The commit-reveal argument, as two columns instead of two paragraphs. The
 * asymmetry is the message, so the last line of each column is the verdict.
 */
export function CompareColumns() {
  const t = useT();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const shown = useOnScreen(ref);

  const cols = [
    { ...t.compare.commitReveal, ok: false },
    { ...t.compare.privateEr, ok: true },
  ];

  return (
    <div ref={ref} className="grid gap-3 sm:grid-cols-2">
      {cols.map((c, i) => (
        <motion.div
          key={c.title}
          initial={reduce ? undefined : { opacity: 0, y: 14 }}
          animate={reduce || shown ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.4, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          className={`flex flex-col rounded-xl border p-5 ${
            c.ok ? "border-sealed/35 bg-sealed/[0.04]" : "border-edge bg-surface/50"
          }`}
        >
          <h3
            className={`font-mono text-sm ${c.ok ? "text-sealed" : "text-muted"}`}
          >
            {c.title}
          </h3>

          <ul className="mt-4 flex-1 space-y-2.5">
            {c.points.map((p, j) => (
              <li key={j} className="flex gap-2.5 text-xs leading-relaxed">
                <span
                  className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${
                    c.ok ? "bg-sealed" : "bg-edgeStrong"
                  }`}
                  aria-hidden
                />
                <span className={j === c.points.length - 1 ? "text-chalk" : "text-muted"}>
                  {p}
                </span>
              </li>
            ))}
          </ul>

          <p
            className={`mt-5 border-t pt-4 font-mono text-2xs ${
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
