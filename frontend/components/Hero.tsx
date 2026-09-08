"use client";

import { Fragment, useRef } from "react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { useT } from "@/lib/i18n";
import { FlowMap } from "./Flow";
import { PulseRatio } from "./PulseRatio";

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
        {/* The space between the words is a text node, not a margin. A
            margin looks the same and reads as one long word: it is what the
            clipboard copies, what find-in-page searches, and what a screen
            reader announces — and this sentence is the first thing the page
            says. Inline-block words separated by real whitespace lay out the
            same way and survive being read by something that is not an eye. */}
        <h1 key={t.hero.headline} className="display max-w-[16ch]">
          <span className="block">
            {headline.map((w, i) => (
              <Fragment key={i}>
                {i > 0 && " "}
                <span
                  className="rc-word"
                  style={reduce ? undefined : { animationDelay: `${i * 55}ms` }}
                >
                  {w}
                </span>
              </Fragment>
            ))}
          </span>
          <span className="block text-muted">
            {subline.map((w, i) => (
              <Fragment key={i}>
                {i > 0 && " "}
                <span
                  className="rc-word"
                  style={
                    reduce
                      ? undefined
                      : { animationDelay: `${(headline.length + i) * 55}ms` }
                  }
                >
                  {w}
                </span>
              </Fragment>
            ))}
          </span>
        </h1>

        <motion.div
          className="mt-9 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
          initial={reduce ? undefined : { y: 14 }}
          animate={reduce ? undefined : { y: 0 }}
          transition={{ delay: 0.5, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="max-w-prose space-y-3">
            <p className="lede text-chalk/85">{t.hero.lede}</p>
            {/* The speed claim, as the reader's own measurement, in the first
                thing anybody sees. Renders nothing until the band below has
                actually measured it — a hero that reserves space for a number
                it does not have is a hero with a hole in it. */}
            <PulseRatio />
          </div>

          <Link
            href="#rondas"
            className="group inline-flex shrink-0 items-center gap-2 font-mono text-sm text-chalk transition-colors hover:text-sealed"
          >
            {t.hero.cta}
            <ArrowDown className="h-3.5 w-3.5 transition-transform group-hover:translate-y-0.5" />
          </Link>
        </motion.div>
      </motion.div>

      {/* The whole sequence, under the sentence that claims it.
          What sat here was a Gale-Shapley run replayed on invented people:
          pretty, and an answer to a question nobody had asked yet. Somebody
          three seconds into the page wants to know what the thing does, and
          the shape of that answer is a flow, not a demo. The demo is section
          01 and it is playable, which is a better version of the same idea.

          `como-funciona` moves here with it. It was a section three screens
          down that drew this same sequence a second time; every link to it
          now lands on the drawing itself. */}
      <motion.div
        id="como-funciona"
        className="mt-12 scroll-mt-28"
        initial={reduce ? undefined : { y: 22 }}
        animate={reduce ? undefined : { y: 0 }}
        transition={{ delay: 0.35, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <FlowMap />
      </motion.div>
    </section>
  );
}
