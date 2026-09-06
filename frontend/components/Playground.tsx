"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Play, RotateCcw, Shuffle, SkipForward } from "lucide-react";
import {
  NONE,
  advanceOneRound,
  buildState,
  findBlockingPair,
  type MatchState,
} from "@/lib/matching";
import { useT } from "@/lib/i18n";
import { springPanel } from "@/lib/motion";

const FOUNDERS = ["Ana", "Beto", "Cami", "Dani"];
const BUILDERS = ["Eli", "Fran", "Gus", "Hana"];
const N = 4;

/** Deterministic bytes, so a shared screenshot and a rerun agree. */
function seedBytes(seed: number): Uint8Array {
  let s = (seed || 1) >>> 0;
  return Uint8Array.from({ length: 32 }, () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s >>> 24;
  });
}

function shuffled(n: number, rand: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

interface Step {
  pairs: number[];
  proposals: number;
}

/**
 * The algorithm, running on preferences the visitor chose.
 *
 * Everything else on this page asks you to believe a claim: the lists stay
 * private, the result is stable. This is the one place you can operate the
 * mechanism yourself and watch it reach a matching nobody wants to leave — no
 * wallet, no transaction, no waiting.
 *
 * It runs the same implementation the test suite proves correct against seven
 * hundred generated markets, which is also the second implementation the Rust
 * is checked against. What you drive here is not a mock of the algorithm.
 */
export function Playground() {
  const t = useT();
  const reduce = useReducedMotion();
  const [seed, setSeed] = useState(7);
  const [steps, setSteps] = useState<Step[]>([]);
  const [cursor, setCursor] = useState(0);
  const timer = useRef<number | null>(null);

  // Preferences are regenerated from the seed, so "shuffle" is one number and
  // the whole state stays reproducible.
  const { founderRankings, builderRankings } = useMemo(() => {
    const rand = prng(seed);
    return {
      founderRankings: Array.from({ length: N }, () => shuffled(N, rand)),
      builderRankings: Array.from({ length: N }, () => shuffled(N, rand)),
    };
  }, [seed]);

  /** Every proposal round, computed up front so stepping is instant. */
  const timeline = useMemo(() => {
    const ms: MatchState = buildState(founderRankings, builderRankings);
    const pairs = new Array(16).fill(NONE);
    const rnd = seedBytes(seed);
    const out: Step[] = [{ pairs: [...pairs], proposals: 0 }];
    for (let i = 0; i < 32; i++) {
      const proposals = advanceOneRound(ms, pairs, N, rnd);
      out.push({ pairs: [...pairs], proposals });
      if (proposals === 0) break;
    }
    return { out, builderRank: ms.builderRank };
  }, [founderRankings, builderRankings, seed]);

  const shown = steps.length ? steps : [timeline.out[0]];
  const current = shown[Math.min(cursor, shown.length - 1)];
  const done = cursor >= timeline.out.length - 1;

  const blocking = useMemo(
    () =>
      done
        ? findBlockingPair(
            timeline.out[timeline.out.length - 1].pairs,
            founderRankings,
            timeline.builderRank,
            N,
          )
        : null,
    [done, timeline, founderRankings],
  );

  function stop() {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }

  function step() {
    setSteps(timeline.out);
    setCursor((c) => Math.min(c + 1, timeline.out.length - 1));
  }

  function run() {
    stop();
    setSteps(timeline.out);
    setCursor(0);
    timer.current = window.setInterval(() => {
      setCursor((c) => {
        if (c >= timeline.out.length - 1) {
          stop();
          return c;
        }
        return c + 1;
      });
    }, reduce ? 1 : 900);
  }

  function reset(nextSeed?: number) {
    stop();
    setSteps([]);
    setCursor(0);
    if (nextSeed !== undefined) setSeed(nextSeed);
  }

  const totalProposals = timeline.out
    .slice(0, cursor + 1)
    .reduce((a, s) => a + s.proposals, 0);
  const matched = current.pairs.slice(0, N).filter((b) => b !== NONE).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_15rem]">
      {/* ------------------------------------------------------ the market */}
      <div className="rounded-2xl border border-edge bg-surface/60 p-4 sm:p-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-6">
          <ul className="space-y-2">
            {FOUNDERS.map((name, f) => {
              const partner = current.pairs[f];
              return (
                <li key={name} className="space-y-1">
                  <div
                    className={`flex h-11 items-center justify-between gap-2 rounded-xl border px-3 transition-colors ${
                      partner !== NONE
                        ? "border-sealed/50 bg-sealed/[0.08]"
                        : "border-edge bg-surface2/50"
                    }`}
                  >
                    <span className="truncate font-mono text-xs text-chalk">{name}</span>
                    <span className="shrink-0 font-mono text-2xs text-dim">
                      {founderRankings[f].map((b) => BUILDERS[b][0]).join("")}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* The links, drawn between the two columns. */}
          <svg
            viewBox="0 0 60 196"
            className="h-full w-14 sm:w-20"
            preserveAspectRatio="none"
            aria-hidden
          >
            {current.pairs.slice(0, N).map((b, f) =>
              b === NONE ? null : (
                <motion.line
                  key={`${f}-${b}`}
                  x1="0"
                  x2="60"
                  y1={22 + f * 50}
                  y2={22 + b * 50}
                  stroke="var(--sealed)"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                  initial={reduce ? undefined : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.9 }}
                  transition={{ duration: 0.35 }}
                />
              ),
            )}
          </svg>

          <ul className="space-y-2">
            {BUILDERS.map((name, b) => {
              const held = current.pairs.slice(0, N).indexOf(b) !== -1;
              return (
                <li key={name}>
                  <div
                    className={`flex h-11 items-center justify-between gap-2 rounded-xl border px-3 transition-colors ${
                      held
                        ? "border-sealed/50 bg-sealed/[0.08]"
                        : "border-edge bg-surface2/50"
                    }`}
                  >
                    <span className="shrink-0 font-mono text-2xs text-dim">
                      {builderRankings[b].map((f) => FOUNDERS[f][0]).join("")}
                    </span>
                    <span className="truncate font-mono text-xs text-chalk">{name}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-2xs text-dim">
          <span>{t.play.legend}</span>
        </p>
      </div>

      {/* -------------------------------------------------------- controls */}
      <aside className="space-y-4">
        <dl className="grid grid-cols-3 gap-2 lg:grid-cols-1">
          {[
            [t.play.round, `${cursor}`],
            [t.play.matched, `${matched}/${N}`],
            [t.play.proposals, `${totalProposals}`],
          ].map(([k, v]) => (
            <div
              key={k}
              className="rounded-xl border border-edge bg-surface/60 px-3 py-2"
            >
              <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
                {k}
              </dt>
              <dd className="tnum font-mono text-base text-chalk">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          <button
            onClick={run}
            className="glass flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl font-mono text-2xs text-chalk transition-colors hover:text-sealed"
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            {t.play.run}
          </button>
          <button
            onClick={step}
            disabled={done && steps.length > 0}
            className="glass flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl font-mono text-2xs text-muted transition-colors hover:text-chalk disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SkipForward className="h-3.5 w-3.5" aria-hidden />
            {t.play.step}
          </button>
          <button
            onClick={() => reset(Math.floor(Math.random() * 100000))}
            className="glass flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl font-mono text-2xs text-muted transition-colors hover:text-open"
          >
            <Shuffle className="h-3.5 w-3.5" aria-hidden />
            {t.play.shuffle}
          </button>
          <button
            onClick={() => reset()}
            className="glass flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl font-mono text-2xs text-muted transition-colors hover:text-chalk"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            {t.play.reset}
          </button>
        </div>

        {/* The claim, checked live rather than asserted. */}
        <AnimatePresence>
          {done && steps.length > 0 && (
            <motion.p
              initial={reduce ? undefined : { opacity: 0, y: 6 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={springPanel}
              className="flex items-start gap-2 rounded-xl border border-sealed/40 bg-sealed/[0.07] px-3 py-2.5 text-xs leading-relaxed text-chalk/90"
            >
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sealed" aria-hidden />
              {blocking === null ? t.play.stable : t.play.unstable}
            </motion.p>
          )}
        </AnimatePresence>
      </aside>
    </div>
  );
}
