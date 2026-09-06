"use client";

import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Check, X } from "lucide-react";
import { NONE, buildState, findBlockingPair, runMatching } from "@/lib/matching";
import { useT } from "@/lib/i18n";

const CASES = 400;

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function shuffled(n: number, rand: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Report {
  cases: number;
  blocking: number;
  unconverged: number;
  maxRounds: number;
  totalPairs: number;
  ms: number;
}

/**
 * The stability guarantee, checked in front of the reader.
 *
 * This is the property test out of the suite, running in the browser on
 * markets generated here rather than results prepared earlier. A blocking
 * pair is a founder and a builder who would both rather have each other than
 * what they got; a matching with none is what "stable" means, and it is the
 * one thing this product promises that is a mathematical claim rather than an
 * engineering one.
 *
 * Seeded, so the same button produces the same numbers on any machine and a
 * screenshot can be reproduced.
 */
export function StabilityProof() {
  const t = useT();
  const reduce = useReducedMotion();
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  function run() {
    setBusy(true);
    setReport(null);
    // Yield once so the button can paint its busy state before the loop.
    setTimeout(() => {
      const started = performance.now();
      let blocking = 0;
      let unconverged = 0;
      let maxRounds = 0;
      let totalPairs = 0;

      for (let seed = 1; seed <= CASES; seed++) {
        const rand = prng(seed);
        const nF = 2 + Math.floor(rand() * 7);
        const nB = 2 + Math.floor(rand() * 7);
        const founderRankings = Array.from({ length: nF }, () => shuffled(nB, rand));
        const builderRankings = Array.from({ length: nB }, () => shuffled(nF, rand));
        const ms = buildState(founderRankings, builderRankings);
        const randomness = Uint8Array.from({ length: 32 }, () =>
          Math.floor(rand() * 256),
        );

        const res = runMatching(ms, nF, randomness);
        if (!res.settled) unconverged++;
        maxRounds = Math.max(maxRounds, res.ticks);
        totalPairs += res.pairs.slice(0, nF).filter((b) => b !== NONE).length;
        if (findBlockingPair(res.pairs, founderRankings, ms.builderRank, nF)) {
          blocking++;
        }
      }

      setReport({
        cases: CASES,
        blocking,
        unconverged,
        maxRounds,
        totalPairs,
        ms: Math.round(performance.now() - started),
      });
      setBusy(false);
    }, 30);
  }

  const clean = report && report.blocking === 0 && report.unconverged === 0;

  return (
    <section className="rounded-2xl border border-edge bg-surface/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h2 className="text-base font-medium tracking-tight">{t.proof.stability.title}</h2>
          <p className="max-w-prose text-xs leading-relaxed text-muted">
            {t.proof.stability.lede}
          </p>
        </div>
        <button
          onClick={run}
          disabled={busy}
          className="glass h-11 shrink-0 cursor-pointer rounded-xl px-4 font-mono text-2xs text-chalk transition-colors hover:text-sealed disabled:opacity-60"
        >
          {busy ? t.proof.stability.running : t.proof.stability.run}
        </button>
      </div>

      {/* Visible the moment it exists: see VerifyPanel for why. */}
      {report && (
        <div>
            <dl className="mt-5 grid gap-px overflow-hidden rounded-xl border border-edge bg-edge sm:grid-cols-4">
              {[
                [t.proof.stability.cases, String(report.cases)],
                [t.proof.stability.blocking, String(report.blocking)],
                [t.proof.stability.deepest, String(report.maxRounds)],
                [t.proof.stability.time, `${report.ms} ms`],
              ].map(([k, v], i) => (
                <div key={k} className="bg-surface px-4 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
                    {k}
                  </dt>
                  <dd
                    className={`tnum font-mono text-xl ${
                      i === 1 ? (report.blocking === 0 ? "text-sealed" : "text-open") : "text-chalk"
                    }`}
                  >
                    {v}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
              {clean ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sealed" aria-hidden />
              ) : (
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-open" aria-hidden />
              )}
              {clean ? t.proof.stability.passed : t.proof.stability.failed}
            </p>
        </div>
      )}
    </section>
  );
}
