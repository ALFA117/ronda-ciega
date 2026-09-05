"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Lock } from "lucide-react";
import { MatchGraph } from "./MatchGraph";
import { NONE } from "@/lib/constants";
import { useT } from "@/lib/i18n";

const LEFT = [{ label: "ana" }, { label: "beto" }, { label: "cami" }, { label: "dani" }];
const RIGHT = [{ label: "eli" }, { label: "fran" }, { label: "gus" }, { label: "hana" }];

/**
 * A real Gale–Shapley run, replayed on invented people.
 *
 * Frame 2 is the one that matters: `ana` is holding `eli` and then loses her,
 * because `cami` proposes and `eli` ranks `cami` higher. Showing a pairing come
 * apart is what makes this read as an algorithm resolving rather than as a
 * decorative loop.
 */
const FRAMES: number[][] = [
  [NONE, NONE, NONE, NONE],
  [0, 1, NONE, NONE],
  [NONE, 1, 0, 3],
  [2, 1, 0, 3],
];

export function HeroVisual() {
  const t = useT();
  const reduce = useReducedMotion();
  const [frame, setFrame] = useState(reduce ? FRAMES.length - 1 : 0);

  useEffect(() => {
    if (reduce) return;
    const id = setTimeout(
      () => setFrame((f) => (f + 1) % (FRAMES.length + 1)),
      frame === FRAMES.length - 1 ? 2600 : 1100,
    );
    return () => clearTimeout(id);
  }, [frame, reduce]);

  const idx = Math.min(frame, FRAMES.length - 1);
  const settled = idx === FRAMES.length - 1;

  return (
    <div className="relative overflow-hidden rounded-xl border border-edge bg-surface/50">
      <div className="grid-field absolute inset-0" aria-hidden />

      <div className="relative space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.18em] text-sealed">
            <Lock className="h-3 w-3" aria-hidden />
            {t.hero.sealed}
          </span>
          <span className="tnum font-mono text-2xs text-muted">
            {settled ? t.hero.stable : `${t.hero.round} ${idx}`}
          </span>
        </div>

        <MatchGraph left={LEFT} right={RIGHT} pairs={FRAMES[idx]} compact />

        <div className="space-y-3 border-t border-edge/70 pt-3">
          <div className="flex items-center justify-between font-mono text-2xs text-muted">
            <span>{t.hero.proposers}</span>
            <span>{t.hero.receivers}</span>
          </div>
          <motion.p
            key={settled ? "done" : "run"}
            initial={reduce ? undefined : { opacity: 0, y: 4 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`text-center font-mono text-2xs ${
              settled ? "text-sealed" : "text-muted"
            }`}
          >
            {settled ? t.hero.settledNote : t.hero.proposing}
          </motion.p>
        </div>
      </div>
    </div>
  );
}
