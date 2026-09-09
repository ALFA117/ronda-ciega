import type { Transition, Variants } from "framer-motion";

/**
 * One rhythm for the whole app. Every animation pulls its timing from here so
 * the interface feels like a single system rather than a pile of components
 * that each picked their own easing.
 */

/** Interactive: press, hover, drag. Springs interrupt and reverse cleanly. */
export const springSnappy: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 20,
};

/** Panels and cards arriving. */
export const springPanel: Transition = {
  type: "spring",
  stiffness: 280,
  damping: 26,
};

/** Large layout shifts — a pairing moving from one partner to another. */
export const springLayout: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 28,
};

/** Passive entrance. Fixed duration reads as pacing, not physics. */
export const easeEnter: Transition = {
  duration: 0.4,
  ease: [0.16, 1, 0.3, 1],
};

/** Exits run at ~65% of the entrance so leaving feels responsive. */
export const easeExit: Transition = {
  duration: 0.26,
  ease: [0.4, 0, 1, 1],
};

/**
 * A cascade, with a ceiling on how long it can take.
 *
 * At 45ms a row, a list of forty rounds spends nearly two seconds arriving
 * and the last one shows up after the reader has already started scrolling —
 * which reads as a slow page, not a considered one. `count` shortens the step
 * so the whole run fits inside CASCADE_MS however many items there are; below
 * that many it changes nothing.
 */
const CASCADE_MS = 360;
const STEP_S = 0.045;

export const stagger = (delayChildren = 0, count?: number): Variants => ({
  hidden: {},
  show: {
    transition: {
      staggerChildren:
        count && count > 1
          ? Math.min(STEP_S, CASCADE_MS / 1000 / (count - 1))
          : STEP_S,
      delayChildren,
    },
  },
});

/**
 * Entrances move, they do not appear.
 *
 * These used to start at `opacity: 0`, which makes the animation load-bearing:
 * the content is not merely un-animated when the loop is throttled, it is
 * absent. Measured on the deployed site with animations stalled, eighteen
 * elements were invisible — including the four measured numbers under the
 * hero, which are the whole argument of the page.
 *
 * Starting from a visible, displaced state costs almost nothing visually and
 * makes the worst case "it did not slide" instead of "it is not there".
 */
export const riseIn: Variants = {
  hidden: { y: 14 },
  show: { y: 0, transition: springPanel },
};

/** For genuinely optional decoration, where absence is not a loss. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: easeEnter },
};
