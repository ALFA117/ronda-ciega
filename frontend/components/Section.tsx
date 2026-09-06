"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useOnScreen } from "@/hooks/useOnScreen";
import { easeEnter } from "@/lib/motion";

/**
 * A band of the page.
 *
 * The numeral used to be absolutely positioned behind the head, which put it
 * straight on top of the section label at every width — six overlaps, one per
 * section. It now sits in the flow above the label, so it cannot collide with
 * anything no matter how the text wraps. Rhythm without a stacking bug.
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
    <section id={id} className="bleed-rule scroll-mt-28 pt-12 sm:pt-16 lg:pt-20">
      <motion.div
        ref={ref}
        className="grid gap-x-8 gap-y-5 lg:grid-cols-[12rem_1fr]"
        initial={reduce ? undefined : { opacity: 0, y: 18 }}
        animate={reduce || shown ? { opacity: 1, y: 0 } : undefined}
        transition={easeEnter}
      >
        <div className="flex items-baseline gap-3 lg:block">
          <span aria-hidden className="ghost-num block leading-none">
            {index}
          </span>
          <span className="font-mono text-2xs uppercase tracking-[0.2em] text-muted lg:mt-3 lg:block">
            {label}
          </span>
        </div>

        <div className={wide ? "" : "max-w-3xl"}>
          <h2 className="display-sm [text-wrap:balance]">{title}</h2>
          {lede && <p className="lede mt-5 max-w-prose text-muted">{lede}</p>}
        </div>
      </motion.div>

      <div className={`mt-10 sm:mt-12 ${wide ? "" : "lg:pl-[15rem]"}`}>
        {children}
      </div>
    </section>
  );
}
