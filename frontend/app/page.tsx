"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Connection } from "@solana/web3.js";
import { DEVNET_RPC } from "@/lib/constants";
import { getReadProgram, RoundAccount } from "@/lib/program";
import { fetchRounds, pickTickerRound } from "@/lib/rounds";
import { publicTeeConnection } from "@/lib/tee";
import { useT } from "@/lib/i18n";
import { Note, Panel } from "@/components/ui";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PreflightBanner } from "@/components/Preflight";
import { Hero } from "@/components/Hero";
import { Section } from "@/components/Section";
import { StatBand } from "@/components/StatBand";
import { Ticker } from "@/components/Ticker";
import { StartPanel } from "@/components/StartPanel";
import { Playground } from "@/components/Playground";
import { LedgerProof } from "@/components/LedgerProof";
import { RoundList } from "@/components/RoundList";
import { Footer } from "@/components/Footer";
import { CompareColumns } from "@/components/FlowDiagram";

// Charts sit below the fold and pull their own code.
const ConvergenceChart = dynamic(
  () => import("@/components/charts/Charts").then((m) => m.ConvergenceChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const LatencyChart = dynamic(
  () => import("@/components/charts/Charts").then((m) => m.LatencyChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

function ChartSkeleton() {
  return (
    <div className="h-60 animate-pulse rounded-xl border border-edge bg-surface/40" />
  );
}

export default function Home() {
  const t = useT();
  const [rounds, setRounds] = useState<RoundAccount[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const connection = new Connection(DEVNET_RPC, "confirmed");
        const program = getReadProgram(connection);
        const { rounds: found } = await fetchRounds(
          connection,
          program,
          publicTeeConnection(),
        );
        setRounds(found);
      } catch {
        setRounds([]);
      }
    })();
  }, []);

  // Only a settled transparent round has real frames to chart. None yet means
  // the chart says so rather than inventing a series.
  const showcase = rounds?.find((r) => r.status === "settled" && r.transparent);
  const latest = pickTickerRound(rounds);

  return (
    <>
      <PreflightBanner />
      <Hero />

      {latest && (
        <div className="mt-8">
          <Ticker round={latest} />
        </div>
      )}

      {/* A connected wallet came here to do something. Renders nothing when
          no wallet is connected, so the pitch is untouched for a first read. */}
      <div className="mt-8">
        <StartPanel />
      </div>

      {/* Six figures in one frame: four measured once by me and written
          down, two measured now by the reader against both endpoints. They
          were two strips with a gap between them, which said "here are some
          numbers" twice and cost two hundred pixels to do it. */}
      <div className="mt-8">
        <ErrorBoundary>
          <StatBand />
        </ErrorBoundary>
      </div>

      {/* First, before a word of argument: the algorithm, running, on lists
          the reader can reshuffle. The page used to bury this behind three
          hundred words and nobody scrolled that far. */}
      <Section
        index="01"
        label={t.play.label}
        title={t.play.title}
        lede={t.play.lede}
        id="probar"
        wide
      >
        <Playground />
      </Section>

{/* The problem and the obvious fix that does not work, in one section.
          They were two, each paying for its own heading and its own eighty
          pixels of top padding, for what is a single thought in two beats: why
          nobody says who they want, and why sealing it with a hash does not
          help. The commit-reveal anchor stays on the second beat so every link
          to it still lands. */}
      <Section
        index="02"
        label={t.problem.label}
        title={t.problem.title}
        id="problema"
        wide
      >
        {/* A numbered editorial list, not three equal cards. */}
        <ol className="divide-y divide-edge border-y border-edge">
          {t.problem.cards.map((c, i) => (
            <li key={c.title} className="grid gap-3 py-5 sm:grid-cols-[3rem_1fr]">
              <span className="tnum font-mono text-2xs text-muted">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="space-y-2">
                <h3 className="text-base font-medium">{c.title}</h3>
                <p className="max-w-prose text-sm leading-relaxed text-muted">
                  {c.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div id="commit-reveal" className="scroll-mt-28 pt-12 sm:pt-14">
          <h3 className="display-sm [text-wrap:balance]">{t.compare.title}</h3>
          <div className="mt-8">
            <CompareColumns />
          </div>
        </div>
      </Section>

      <Section
        index="03"
        label={t.stats.label}
        title={t.stats.title}
        id="medido"
        wide
      >
        {/* The claim the whole project rests on, counted rather than asserted. */}
        <div className="mb-4 space-y-3">
          <ErrorBoundary>
            <LedgerProof />
          </ErrorBoundary>
          <Link
            href="/proof"
            className="glass inline-flex h-11 items-center gap-2 rounded-xl px-4 font-mono text-2xs text-chalk transition-colors hover:text-sealed"
          >
            {t.proof.title}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ErrorBoundary>
            {showcase ? (
              <ConvergenceChart round={showcase} />
            ) : (
              <Panel className="p-6">
                <Note>{t.stats.empty}</Note>
              </Panel>
            )}
          </ErrorBoundary>
          <ErrorBoundary>
            <LatencyChart />
          </ErrorBoundary>
        </div>
      </Section>

      <Section
        index="04"
        label={t.limits.label}
        title={t.limits.title}
        id="limites"
      >
        <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {t.limits.items.map((l) => (
            <li key={l.title} className="space-y-1.5 border-t border-edge pt-4">
              <h3 className="font-mono text-2xs uppercase tracking-[0.14em] text-open">
                {l.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted">{l.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        index="05"
        label={t.rounds.label}
        title={t.rounds.note}
        id="rondas"
        wide
      >
        {rounds === null && (
          <div aria-live="polite">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[88px] animate-pulse border-b border-edge bg-surface/30"
              />
            ))}
          </div>
        )}

        {rounds?.length === 0 && (
          <Panel className="p-10 text-center">
            <Note>{t.rounds.empty}</Note>
          </Panel>
        )}

        {rounds && rounds.length > 0 && <RoundList rounds={rounds} />}
      </Section>

      <Footer />
    </>
  );
}
