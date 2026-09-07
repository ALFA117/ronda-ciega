"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { useT } from "@/lib/i18n";
import { HeroVisual } from "./HeroVisual";

/**
 * Full-bleed hero.
 *
 * The old one was text-left / box-right in a fixed grid — the most generic
 * layout on the web. This one lets the headline run to display size and puts
 * the diagram underneath at full width, because the diagram *is* the product
 * and shrinking it into a sidebar was the single biggest thing making the page
 * look like a template.
 */
export function Hero() {
  const t = useT();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  // Gentle parallax. Gated on reduced motion, since drifting backgrounds are
  // the motion type most likely to cause discomfort.
  const y = useTransform(scrollYProgress, [0, 1], [0, 70]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0.25]);

  const headline = t.hero.headline.split(" ");
  const subline = t.hero.subline.split(" ");

  return (
    <section ref={ref} className="aurora relative overflow-hidden pb-4 pt-6 sm:pt-12">
      <motion.div style={reduce ? undefined : { y, opacity: fade }}>
        {/* The reveal is CSS and moves only the transform. The Framer version
            faded each word up from opacity 0, which meant the headline — the
            first thing on the page — was blank until an animation ran, and
            stayed blank when one did not. Now the words are in the document at
            full opacity and the motion is something the page can lose. */}
        <h1 key={t.hero.headline} className="display max-w-[16ch]">
          <span className="block">
            {headline.map((w, i) => (
              <span
                key={i}
                className="rc-word mr-[0.22em]"
                style={reduce ? undefined : { animationDelay: `${i * 55}ms` }}
              >
                {w}
              </span>
            ))}
          </span>
          <span className="block text-muted">
            {subline.map((w, i) => (
              <span
                key={i}
                className="rc-word mr-[0.22em]"
                style={
                  reduce
                    ? undefined
                    : { animationDelay: `${(headline.length + i) * 55}ms` }
                }
              >
                {w}
              </span>
            ))}
          </span>
        </h1>

        <motion.div
          className="mt-9 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
          initial={reduce ? undefined : { y: 14 }}
          animate={reduce ? undefined : { y: 0 }}
          transition={{ delay: 0.5, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="lede max-w-prose text-chalk/85">{t.hero.lede}</p>

          <Link
            href="#rondas"
            className="group inline-flex shrink-0 items-center gap-2 font-mono text-sm text-chalk transition-colors hover:text-sealed"
          >
            {t.hero.cta}
            <ArrowDown className="h-3.5 w-3.5 transition-transform group-hover:translate-y-0.5" />
          </Link>
        </motion.div>
      </motion.div>

      <motion.div
        className="mt-12"
        initial={reduce ? undefined : { y: 22 }}
        animate={reduce ? undefined : { y: 0 }}
        transition={{ delay: 0.35, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <HeroVisual />
      </motion.div>
    </section>
  );
}
