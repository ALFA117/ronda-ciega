"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useOnScreen } from "@/hooks/useOnScreen";
import { easeEnter } from "@/lib/motion";

/**
 * A band of the page.
 *
 * The previous landing was a stack of identically sized bordered cards, which
 * is what makes a page read as a template. Sections here carry a full-bleed
 * hairline instead of a box, a large ghost numeral for rhythm, and a two
 * column head that puts the label in the margin rather than above the title.
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
    <section id={id} className="bleed-rule scroll-mt-24 pt-14 sm:pt-20">
      <div ref={ref} className="relative">
        {/* Behind the head, bleeding off the left edge on wide screens. */}
        <div
          aria-hidden
          className="ghost-num pointer-events-none absolute -top-6 left-0 select-none lg:-left-2"
        >
          {index}
        </div>

        <motion.div
          className="relative grid gap-6 lg:grid-cols-[13rem_1fr]"
          initial={reduce ? undefined : { opacity: 0, y: 18 }}
          animate={reduce || shown ? { opacity: 1, y: 0 } : undefined}
          transition={easeEnter}
        >
          <div className="pt-1">
            <span className="font-mono text-2xs uppercase tracking-[0.2em] text-muted">
              {label}
            </span>
          </div>

          <div className={wide ? "" : "max-w-3xl"}>
            <h2 className="display-sm [text-wrap:balance]">{title}</h2>
            {lede && (
              <p className="lede mt-5 max-w-prose text-muted">{lede}</p>
            )}
          </div>
        </motion.div>

        <div className={`mt-10 ${wide ? "" : "lg:pl-[13rem]"}`}>{children}</div>
      </div>
    </section>
  );
}
