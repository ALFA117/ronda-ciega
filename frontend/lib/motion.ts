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

export const stagger = (delayChildren = 0): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: 0.045, delayChildren },
  },
});

export const riseIn: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: springPanel },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: easeEnter },
};

/** Words revealing one at a time in the headline. */
export const wordIn: Variants = {
  hidden: { opacity: 0, y: "0.4em" },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};
