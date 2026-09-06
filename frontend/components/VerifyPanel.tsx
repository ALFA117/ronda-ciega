"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, ShieldCheck, X } from "lucide-react";
import { framesFor, type RoundAccount } from "@/lib/program";
import { verifyRound } from "@/lib/verify-round";
import { useT } from "@/lib/i18n";

/**
 * Recompute the round in the reader's browser, against the chain's own answer.
 *
 * Every other claim on this site asks for trust. This one does not: the trace
 * is public, the result is public, and the checking happens on the reader's
 * machine from data they can fetch themselves. It runs on click rather than on
 * load, because a verdict that was already there when you arrived is a claim,
 * and one you started is evidence.
 */
export function VerifyPanel({ round }: { round: RoundAccount }) {
  const t = useT();
  const reduce = useReducedMotion();
  const [result, setResult] = useState<ReturnType<typeof verifyRound> | null>(null);
  const [running, setRunning] = useState(false);

  // Only a transparent round publishes the trace this reads. A private round
  // deliberately has nothing here, and says so.
  if (!round.transparent) return null;

  async function run() {
    setRunning(true);
    setResult(null);
    // A verdict that lands instantly reads as decoration; this is the time it
    // takes to see the frames go by, not fake work.
    await new Promise((r) => setTimeout(r, reduce ? 0 : 420));
    setResult(
      verifyRound({
        frames: framesFor(round),
        pairs: round.pairs,
        founderCount: round.founderCount,
        builderCount: round.builderCount,
      }),
    );
    setRunning(false);
  }

  const labels: Record<string, string> = {
    injective: t.verify.injective,
    inRange: t.verify.inRange,
    monotone: t.verify.monotone,
    matchesChain: t.verify.matchesChain,
  };

  return (
    <section className="rounded-2xl border border-edge bg-surface/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h2 className="flex items-center gap-2 text-base font-medium tracking-tight">
            <ShieldCheck className="h-4 w-4 text-sealed" aria-hidden />
            {t.verify.title}
          </h2>
          <p className="max-w-prose text-xs leading-relaxed text-muted">
            {t.verify.lede}
          </p>
        </div>

        <button
          onClick={run}
          disabled={running}
          className="glass h-11 shrink-0 cursor-pointer rounded-xl px-4 font-mono text-2xs text-chalk transition-colors hover:text-sealed disabled:opacity-60"
        >
          {running ? t.verify.running : t.verify.run}
        </button>
      </div>

      {/* No entrance animation on the evidence itself. Animating height from
          zero leaves the result clipped to nothing if the animation never runs
          — a throttled tab, a recording overlay, reduced motion handled badly
          — and a proof that is invisible is worse than no proof. */}
      {result && (
        <div>
            <ul className="mt-5 divide-y divide-edge border-y border-edge">
              {result.checks.map((c, i) => (
                <motion.li
                  key={c.id}
                  initial={false}
                  animate={reduce ? undefined : { opacity: 1, x: 0 }}
                  transition={{ delay: reduce ? 0 : i * 0.09 }}
                  className="flex items-center gap-3 py-2.5"
                >
                  {c.ok ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-sealed" aria-hidden />
                  ) : (
                    <X className="h-3.5 w-3.5 shrink-0 text-open" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 text-xs text-chalk/90">
                    {labels[c.id] ?? c.id}
                  </span>
                  <span className="tnum shrink-0 font-mono text-2xs text-dim">
                    {c.detail}
                  </span>
                </motion.li>
              ))}
            </ul>

          <p className="mt-4 text-xs leading-relaxed text-muted">
            <span className={result.allPassed ? "text-sealed" : "text-open"}>
              {result.allPassed ? t.verify.passed : t.verify.failed}
            </span>{" "}
            {t.verify.limit}
          </p>
        </div>
      )}
    </section>
  );
}
