"use client";

import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Check, X } from "lucide-react";
import {
  NONE,
  UNRANKED,
  buildState,
  findBlockingPair,
  runMatching,
} from "@/lib/matching";
import { seedBytes } from "@/lib/tiebreak";
import { useT } from "@/lib/i18n";

const CASES = 400;

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * A ranking of `n` people, keeping the first `keep` of them.
 *
 * The version this replaces always returned the whole permutation, and that
 * quietly narrowed what four hundred markets were checking. Gale-Shapley
 * consults the tie-break only when a receiver has ranked *neither* of two
 * proposers, and a receiver who ranked everybody never has — so `break_tie`,
 * the branch the VRF exists to protect, was never once executed by the proof
 * that this page presents as the guarantee.
 *
 * Partial lists are also the product's real shape: ranking is optional, and
 * leaving someone out is how a participant says they would rather stay
 * unmatched.
 */
function shuffled(n: number, rand: () => number, keep = n): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(1, Math.min(keep, n)));
}

/** Did this market ever put two unranked proposers in front of one receiver? */
function needsTieBreak(builderRank: number[][], founderCount: number): boolean {
  for (const row of builderRank) {
    let unranked = 0;
    for (let f = 0; f < founderCount; f++) {
      if (row[f] === UNRANKED) unranked++;
    }
    if (unranked >= 2) return true;
  }
  return false;
}

interface Report {
  cases: number;
  blocking: number;
  unconverged: number;
  maxRounds: number;
  totalPairs: number;
  /** How many of the markets could reach the tie-break at all. */
  withTies: number;
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
      let withTies = 0;

      for (let seed = 1; seed <= CASES; seed++) {
        const rand = prng(seed);
        const nF = 2 + Math.floor(rand() * 7);
        const nB = 2 + Math.floor(rand() * 7);

        // Half the markets keep complete lists, half are cut short. Both
        // shapes occur in practice and only the second one reaches the
        // tie-break, so checking only the first left the branch the VRF
        // protects unexercised by the page's headline claim.
        const partial = seed % 2 === 0;
        const cut = (n: number) => (partial ? 1 + Math.floor(rand() * n) : n);

        const founderRankings = Array.from({ length: nF }, () =>
          shuffled(nB, rand, cut(nB)),
        );
        const builderRankings = Array.from({ length: nB }, () =>
          shuffled(nF, rand, cut(nF)),
        );
        const ms = buildState(founderRankings, builderRankings);
        // The randomness comes from the mixed generator rather than this
        // LCG's low bits, which produced a frozen first byte and a tie-break
        // that favoured the challenger three times in five.
        const randomness = seedBytes(seed * 2654435761);

        if (needsTieBreak(ms.builderRank, nF)) withTies++;

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
        withTies,
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
                [t.proof.stability.withTies, String(report.withTies)],
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
