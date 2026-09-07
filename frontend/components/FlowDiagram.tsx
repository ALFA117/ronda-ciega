"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Lock, UserPlus, Zap } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useOnScreen } from "@/hooks/useOnScreen";
import { riseIn, stagger } from "@/lib/motion";

const ICONS = [UserPlus, Lock, Zap, Check];

/**
 * Where each step happens is the point, so the boundary between L1 and the
 * enclave is drawn as an actual boundary: the two middle steps sit inside a
 * marked region, and a connector line runs through all four so they read as
 * one sequence rather than four cards that happen to be adjacent.
 */
export function FlowDiagram() {
  const t = useT();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const shown = useOnScreen(ref, 80);

  // The steps light up one after another once the diagram is on screen, so
  // the sequence reads as a sequence without anyone clicking through it.
  const [lit, setLit] = useState(reduce ? 3 : -1);
  useEffect(() => {
    if (!shown || reduce) return;
    let i = -1;
    const id = setInterval(() => {
      i++;
      setLit(i);
      if (i >= t.solution.steps.length - 1) clearInterval(id);
    }, 420);
    return () => clearInterval(id);
  }, [shown, reduce, t.solution.steps.length]);

  return (
    <div ref={ref} className="relative">
      {/* The spine. Draws itself once, left to right, under the steps. */}
      <div className="pointer-events-none absolute left-0 right-0 top-[26px] hidden lg:block">
        <motion.div
          className="h-px origin-left bg-gradient-to-r from-edge via-sealed/40 to-edge"
          initial={reduce ? undefined : { scaleX: 0 }}
          animate={reduce || shown ? { scaleX: 1 } : undefined}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      <motion.ol
        className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6"
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
              className="relative"
            >
              <motion.div
                animate={
                  reduce
                    ? undefined
                    : {
                        scale: i === lit ? 1.06 : 1,
                        borderColor:
                          i <= lit
                            ? "rgba(var(--sealed-rgb), 0.55)"
                            : "var(--edge)",
                      }
                }
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className={`relative z-10 mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-xl border ${
                  inside ? "sealed-hatch" : ""
                } surface-raised bg-surface ${
                  i <= lit ? "text-sealed" : "text-muted"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </motion.div>

              <div className="flex items-baseline gap-2">
                <span className="tnum font-mono text-2xs text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-sm font-medium">{s.title}</h3>
              </div>
              <p className="mt-2 max-w-[26ch] text-xs leading-relaxed text-muted">
                {s.body}
              </p>
              {inside && (
                <span className="mt-3 inline-block rounded border border-sealed/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-sealed">
                  enclave
                </span>
              )}
            </motion.li>
          );
        })}
      </motion.ol>
    </div>
  );
}

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
