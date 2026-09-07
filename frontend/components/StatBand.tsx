"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useOnScreen } from "@/hooks/useOnScreen";
import { useT } from "@/lib/i18n";

/**
 * Four numbers the project actually measured, not four adjectives.
 *
 * Every value came off a real devnet run and is reproducible with
 * `scripts/spike.ts`. The zero is the one that carries the argument: zero
 * preference lists published, the whole claim as a single digit.
 *
 * Rules between the figures rather than four boxes — boxing each one turns a
 * statement into a dashboard.
 */
const DURATION_MS = 900;

/**
 * A count-up that cannot leave a wrong number on screen.
 *
 * The first version started at 0 and walked to the target on
 * `requestAnimationFrame`. rAF does not merely slow down when a tab stops
 * compositing — it stops being called at all, and the component keeps whatever
 * partial value it had reached. Screenshotted mid-flight, this band read
 * "50 ms" and "16" where the measurements are 671 ms and 214 ms. On a page
 * whose entire argument is that its figures are counted rather than asserted,
 * a stalled animation was inventing measurements and presenting them in the
 * same type as the real ones. Nothing errors; the page just lies.
 *
 * So a timer backs the animation up. `setTimeout` still fires in a throttled
 * or hidden tab — late, but it fires — and it snaps the figure to the truth
 * whether or not a single frame was ever drawn. The animation is now something
 * the page is allowed to lose, which is the same rule the entrances follow.
 */
function Counter({ to, run }: { to: number; run: boolean }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? to : 0);

  useEffect(() => {
    if (reduce || !run) {
      setN(to);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION_MS);
      // ease-out-cubic: fast first, settles rather than stops
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // The guarantee. Everything above is decoration on top of this line.
    const settle = setTimeout(() => {
      cancelAnimationFrame(raf);
      setN(to);
    }, DURATION_MS + 250);

    // A tab hidden mid-count comes back to the real number, not to the frame
    // it froze on.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        cancelAnimationFrame(raf);
        setN(to);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [to, run, reduce]);

  return <>{n}</>;
}

export function StatBand() {
  const t = useT();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const shown = useOnScreen(ref, 80);

  const stats = [
    { value: 671, unit: "ms", label: t.band.matching, open: false },
    { value: 214, unit: "ms", label: t.band.vrf, open: false },
    { value: 1, unit: "tx", label: t.band.oneTx, open: false },
    { value: 0, unit: "", label: t.band.leaked, open: true },
  ];

  return (
    <div
      ref={ref}
      className="grid grid-cols-2 border-y border-edge lg:grid-cols-4"
    >
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          initial={reduce ? undefined : { y: 12 }}
          animate={reduce || shown ? { y: 0 } : undefined}
          transition={{ delay: i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className={`px-5 py-7 sm:px-7 ${
            i % 2 === 1 ? "border-l border-edge" : ""
          } ${i >= 2 ? "border-t border-edge lg:border-t-0" : ""} ${
            i === 2 ? "lg:border-l" : ""
          }`}
        >
          <div className="flex items-baseline gap-1.5">
            <span
              className={`tnum font-mono text-3xl leading-none sm:text-4xl ${
                s.open ? "text-open" : "text-sealed"
              }`}
            >
              <Counter to={s.value} run={shown} />
            </span>
            {s.unit && (
              <span className="font-mono text-sm text-muted">{s.unit}</span>
            )}
          </div>
          <div className="mt-3 max-w-[22ch] text-xs leading-relaxed text-muted">
            {s.label}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
