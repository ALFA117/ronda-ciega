"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useOnScreen } from "@/hooks/useOnScreen";
import { useT } from "@/lib/i18n";
import { riseIn, stagger } from "@/lib/motion";

/**
 * Four numbers the project actually measured, not four adjectives.
 *
 * Every value here came off a real devnet run and is reproducible with
 * `scripts/spike.ts`. The "0" is the one that matters: zero preference lists
 * published, which is the whole claim reduced to a single digit.
 */
export function StatBand() {
  const t = useT();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const shown = useOnScreen(ref);

  const stats = [
    { value: "671", unit: "ms", label: t.band.matching, tone: "sealed" },
    { value: "214", unit: "ms", label: t.band.vrf, tone: "sealed" },
    { value: "1", unit: "tx", label: t.band.oneTx, tone: "sealed" },
    { value: "0", unit: "", label: t.band.leaked, tone: "open" },
  ];

  return (
    <motion.div
      ref={ref}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-edge bg-edge lg:grid-cols-4"
      variants={reduce ? undefined : stagger()}
      initial={reduce ? undefined : "hidden"}
      animate={reduce || shown ? "show" : "hidden"}
    >
      {stats.map((s) => (
        <motion.div
          key={s.label}
          variants={reduce ? undefined : riseIn}
          className="surface-raised bg-surface px-5 py-6"
        >
          <div className="flex items-baseline gap-1">
            <span
              className={`tnum font-mono text-2xl ${
                s.tone === "open" ? "text-open" : "text-sealed"
              }`}
            >
              {s.value}
            </span>
            {s.unit && (
              <span className="font-mono text-xs text-muted">{s.unit}</span>
            )}
          </div>
          <div className="mt-2 text-xs leading-snug text-muted">{s.label}</div>
        </motion.div>
      ))}
    </motion.div>
  );
}
