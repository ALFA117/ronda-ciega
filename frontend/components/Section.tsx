"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useOnScreen } from "@/hooks/useOnScreen";
import { easeEnter } from "@/lib/motion";

/**
 * A band of the page: a clause number and label in the margin, the heading
 * and lede beside them, content below. On phones the margin folds above the
 * heading as one line.
 */
export function Section({
  index,
  label,
  title,
  lede,
  id,
  children,
  wide = false,
}: {
  index: string;
  label: string;
  title: string;
  lede?: string;
  id?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const shown = useOnScreen(ref, 90);

  return (
    <section id={id} className="bleed-rule mt-16 scroll-mt-24 pt-12 sm:mt-20 sm:pt-16">
      <motion.div
        ref={ref}
        className="grid gap-x-10 gap-y-4 lg:grid-cols-[12rem_1fr]"
        initial={reduce ? undefined : { y: 14 }}
        animate={reduce || shown ? { y: 0 } : undefined}
        transition={easeEnter}
      >
        <div className="flex items-center gap-3 lg:block lg:pt-2">
          <span aria-hidden className="ghost-num tnum">
            §{index}
          </span>
          <span className="eyebrow lg:mt-2 lg:block">{label}</span>
        </div>

        <div className={wide ? "" : "max-w-3xl"}>
          <h2 className="display-sm max-w-[28ch] [text-wrap:balance]">{title}</h2>
          {lede && <p className="lede mt-4 max-w-prose text-muted">{lede}</p>}
        </div>
      </motion.div>

      <div className={`mt-10 sm:mt-12 ${wide ? "" : "lg:pl-[14.5rem]"}`}>
        {children}
      </div>
    </section>
  );
}
