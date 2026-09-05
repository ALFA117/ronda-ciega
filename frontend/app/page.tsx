"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Connection } from "@solana/web3.js";
import { ArrowRight } from "lucide-react";
import { DEVNET_RPC } from "@/lib/constants";
import { getReadProgram, RoundAccount } from "@/lib/program";
import { fetchRounds } from "@/lib/rounds";
import { stagger, wordIn } from "@/lib/motion";
import { useT } from "@/lib/i18n";
import {
  Explorer,
  Label,
  Note,
  Panel,
  Reveal,
  StaggerItem,
  StaggerList,
  StatusPill,
  Tag,
} from "@/components/ui";
import { CreateRound } from "@/components/CreateRound";
import { HeroVisual } from "@/components/HeroVisual";
import { StatBand } from "@/components/StatBand";
import { CompareColumns, FlowDiagram } from "@/components/FlowDiagram";
import dynamic from "next/dynamic";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PreflightBanner } from "@/components/Preflight";

// Charts sit below the fold and pull their own code. Deferring them keeps the
// first paint to what the reader actually sees.
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
    <div className="h-56 animate-pulse rounded-xl border border-edge bg-surface/40" />
  );
}

/** A section header, so every band of the page announces itself the same way. */
function SectionHead({ label, title }: { label: string; title: string }) {
  return (
    <Reveal className="space-y-3">
      <Label>{label}</Label>
      <h2 className="max-w-prose text-xl font-medium tracking-[-0.01em] [text-wrap:balance]">
        {title}
      </h2>
    </Reveal>
  );
}

export default function Home() {
  const t = useT();
  const reduce = useReducedMotion();
  const [rounds, setRounds] = useState<RoundAccount[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const connection = new Connection(DEVNET_RPC, "confirmed");
        const program = getReadProgram(connection);
        const { rounds: found } = await fetchRounds(connection, program);
        setRounds(found);
      } catch {
        setRounds([]);
      }
    })();
  }, []);

  const headline = t.hero.headline.split(" ");
  const subline = t.hero.subline.split(" ");
  // The newest settled transparent round is the only one with real frames to
  // chart. No round like that yet means the chart says so rather than inventing.
  const showcase = rounds?.find((r) => r.status === "settled" && r.transparent);

  return (
    <div className="space-y-24 sm:space-y-28">
      <PreflightBanner />
      {/* Hero. `overflow-hidden` contains the aurora, which is deliberately
          wider than its box and would otherwise push the page sideways. */}
      <section className="relative aurora grid items-center gap-10 overflow-hidden lg:grid-cols-[1.05fr_1fr]">
        <div className="space-y-7">
          <motion.h1
            key={t.hero.headline}
            className="text-2xl font-medium tracking-[-0.02em] [text-wrap:balance] sm:text-3xl"
            variants={reduce ? undefined : stagger()}
            initial={reduce ? undefined : "hidden"}
            animate={reduce ? undefined : "show"}
          >
            <span className="block">
              {headline.map((w, i) => (
                <motion.span
                  key={i}
                  variants={reduce ? undefined : wordIn}
                  className="mr-[0.25em] inline-block"
                >
                  {w}
                </motion.span>
              ))}
            </span>
            <span className="block text-muted">
              {subline.map((w, i) => (
                <motion.span
                  key={i}
                  variants={reduce ? undefined : wordIn}
                  className="mr-[0.25em] inline-block"
                >
                  {w}
                </motion.span>
              ))}
            </span>
          </motion.h1>

          <Reveal delay={0.2}>
            <p className="max-w-prose text-base leading-relaxed text-chalk/85">
              {t.hero.lede}
            </p>
          </Reveal>

          <Reveal delay={0.3}>
            <Link
              href="#rondas"
              className="group inline-flex items-center gap-2 font-mono text-sm text-chalk transition-colors hover:text-sealed"
            >
              {t.hero.cta}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <HeroVisual />
        </Reveal>
      </section>

      {/* Measured, before anything is claimed */}
      <StatBand />

      {/* Problem — three short cards, no prose */}
      <section className="space-y-6">
        <SectionHead label={t.problem.label} title={t.problem.title} />
        <StaggerList className="grid gap-3 sm:grid-cols-3">
          {t.problem.cards.map((c, i) => (
            <StaggerItem key={c.title}>
              <Panel className="h-full space-y-3 p-5">
                <span className="tnum font-mono text-2xs text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-sm font-medium">{c.title}</h3>
                <p className="text-xs leading-relaxed text-muted">{c.body}</p>
              </Panel>
            </StaggerItem>
          ))}
        </StaggerList>
      </section>

      {/* Solution — a diagram, not a paragraph */}
      <section className="space-y-6">
        <SectionHead label={t.solution.label} title={t.solution.title} />
        <Reveal>
          <p className="max-w-prose text-sm leading-relaxed text-muted">
            {t.solution.body}
          </p>
        </Reveal>
        <FlowDiagram />
      </section>

      {/* The argument, as two columns */}
      <section className="space-y-6">
        <SectionHead label={t.compare.label} title={t.compare.title} />
        <CompareColumns />
      </section>

      {/* Measured, not claimed */}
      <section className="space-y-6">
        <SectionHead label={t.stats.label} title={t.stats.title} />
        <div className="grid gap-3 lg:grid-cols-2">
          <Reveal>
            <ErrorBoundary>
              {showcase ? (
                <ConvergenceChart round={showcase} />
              ) : (
                <Panel className="p-5">
                  <Note>{t.stats.empty}</Note>
                </Panel>
              )}
            </ErrorBoundary>
          </Reveal>
          <Reveal delay={0.08}>
            <ErrorBoundary>
              <LatencyChart />
            </ErrorBoundary>
          </Reveal>
        </div>
      </section>

      {/* Limits, stated up front rather than buried in a README */}
      <section className="space-y-6">
        <SectionHead label={t.limits.label} title={t.limits.title} />
        <StaggerList className="grid gap-3 sm:grid-cols-2">
          {t.limits.items.map((l) => (
            <StaggerItem key={l.title}>
              <Panel className="h-full space-y-2 p-5">
                <h3 className="font-mono text-xs text-open">{l.title}</h3>
                <p className="text-xs leading-relaxed text-muted">{l.body}</p>
              </Panel>
            </StaggerItem>
          ))}
        </StaggerList>
      </section>

      {/* Rounds */}
      <section id="rondas" className="scroll-mt-24 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Label>{t.rounds.label}</Label>
            <Note>{t.rounds.note}</Note>
          </div>
          <CreateRound />
        </div>

        {rounds === null && (
          <div className="space-y-3" aria-live="polite">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-[86px] animate-pulse rounded-xl border border-edge bg-surface/40"
              />
            ))}
          </div>
        )}

        {rounds?.length === 0 && (
          <Panel className="p-8 text-center">
            <Note>{t.rounds.empty}</Note>
          </Panel>
        )}

        <StaggerList className="grid gap-3">
          {rounds?.map((r) => (
            <StaggerItem key={r.address.toBase58()}>
              <Link href={`/round/${r.address.toBase58()}`} className="block">
                <motion.div
                  whileHover={reduce ? undefined : { y: -2 }}
                  transition={{ type: "spring", stiffness: 400, damping: 24 }}
                  className="flex items-center justify-between gap-4 rounded-xl border border-edge bg-surface/70 p-5 transition-colors hover:border-edgeStrong"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tnum font-mono text-sm">
                        #{r.roundId.toString().slice(-6)}
                      </span>
                      <StatusPill status={r.status} />
                      {r.transparent && <Tag tone="open">{t.round.transparent}</Tag>}
                    </div>
                    <div className="tnum font-mono text-2xs text-muted">
                      {r.founderCount} {t.rounds.founders} · {r.builderCount}{" "}
                      {t.rounds.builders} ·{" "}
                      <span className="text-sealed">
                        {r.rankingCount} {t.rounds.sealedLists}
                      </span>
                    </div>
                  </div>
                  <Explorer address={r.address.toBase58()} />
                </motion.div>
              </Link>
            </StaggerItem>
          ))}
        </StaggerList>
      </section>
    </div>
  );
}
