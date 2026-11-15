"use client";

import { Fragment, useRef } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowRight } from "lucide-react";
import { useT } from "@/lib/i18n";
import { FlowMap } from "./Flow";
import { PulseRatio } from "./PulseRatio";
import { SealedRound } from "./SealedRound";

/**
 * First screen.
 *
 * Sentence on the left, the mechanism on the right, the seven-step flow under
 * both. The headline words are in the document at full opacity and only
 * their position animates, so the first thing the page says is never blank.
 */
export function Hero() {
  const t = useT();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const headline = t.hero.headline.split(" ");
  const subline = t.hero.subline.split(" ");

  const word = (w: string, i: number, offset: number) => (
    <Fragment key={i}>
      {i > 0 && " "}
      <span
        className="rc-word"
        style={reduce ? undefined : { animationDelay: `${(offset + i) * 45}ms` }}
      >
        {w}
      </span>
    </Fragment>
  );

  return (
    <section ref={ref} className="relative pb-4 pt-8 sm:pt-14 lg:pt-16">
      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-md border border-edge bg-surface px-3 py-1.5 font-mono text-2xs text-muted">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-settled" />
            {t.hero.eyebrow}
          </p>

          <h1 key={t.hero.headline} className="display mt-6 max-w-[17ch] [text-wrap:balance]">
            <span className="block">{headline.map((w, i) => word(w, i, 0))}</span>
            <span className="block italic text-muted">
              {subline.map((w, i) => word(w, i, headline.length))}
            </span>
          </h1>

          <motion.div
            initial={reduce ? undefined : { y: 12 }}
            animate={reduce ? undefined : { y: 0 }}
            transition={{ delay: 0.35, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="lede mt-7 max-w-[60ch] text-muted">{t.hero.lede}</p>

            <div className="mt-9 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center">
              <Link
                href="#probar"
                className="btn-solid group inline-flex h-12 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-medium"
              >
                {t.hero.tryIt}
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
              <Link
                href="#rondas"
                className="btn-outline group inline-flex h-12 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-medium"
              >
                {t.hero.cta}
                <ArrowDown
                  className="h-4 w-4 transition-transform group-hover:translate-y-0.5"
                  aria-hidden
                />
              </Link>
            </div>

            {/* The reader's own measurement; renders nothing until it exists. */}
            <div className="mt-5 min-h-[20px]">
              <PulseRatio />
            </div>
          </motion.div>
        </div>

        {/* The mechanism, framed like a figure in a paper. */}
        <figure className="hidden rounded-2xl border border-edge bg-surface p-5 shadow-[var(--shadow-card)] lg:block">
          <div className="mb-4 flex items-center justify-between border-b border-edge pb-3">
            <span className="eyebrow">{t.hero.sealed}</span>
            <span className="font-mono text-2xs text-dim">Gale–Shapley</span>
          </div>
          <SealedRound />
        </figure>
      </div>

      <motion.div
        id="como-funciona"
        className="mt-14 scroll-mt-28 sm:mt-16"
        initial={reduce ? undefined : { y: 18 }}
        animate={reduce ? undefined : { y: 0 }}
        transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <FlowMap />
      </motion.div>
    </section>
  );
}
