"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { NOT_FOUND, useRound } from "@/hooks/useRound";
import { JoinForm } from "@/components/JoinForm";
import { RankingBuilder } from "@/components/RankingBuilder";
import { RoundControls } from "@/components/RoundControls";
import { MatchTheater } from "@/components/MatchTheater";
import { VerifyPanel } from "@/components/VerifyPanel";
import { PrivacyPanel } from "@/components/PrivacyPanel";
import { Deadline } from "@/components/Deadline";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { StickySummary } from "@/components/StickySummary";
import { PreflightBanner } from "@/components/Preflight";
import { springLayout } from "@/lib/motion";
import { useT } from "@/lib/i18n";
import {
  ErrorText,
  Explorer,
  Label,
  Note,
  Panel,
  Reveal,
  StatusPill,
  Tag,
} from "@/components/ui";

export default function RoundPage({ params }: { params: { address: string } }) {
  const wallet = useWallet();
  const t = useT();
  const reduce = useReducedMotion();
  const headerRef = useRef<HTMLElement>(null);
  const { round, participants, delegated, loading, error, refresh } = useRound(
    params.address,
  );

  if (loading) {
    return (
      <div className="space-y-4" aria-live="polite">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-surface" />
        <div className="h-64 animate-pulse rounded-xl border border-edge bg-surface/40" />
      </div>
    );
  }

  if (error || !round) {
    // A missing or mistyped round is an expected outcome, not a failure to
    // report in raw SDK words.
    const missing = !error || error === NOT_FOUND;
    return (
      <Panel className="mx-auto max-w-lg space-y-4 p-8 text-center">
        <Label>{missing ? "404" : t.common.error}</Label>
        {missing ? (
          <p className="text-sm text-muted">{t.round.notFound}</p>
        ) : (
          <ErrorText>{error}</ErrorText>
        )}
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-mono text-sm text-sealed transition-colors hover:text-chalk"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Ronda Ciega
        </Link>
      </Panel>
    );
  }

  const me = participants.find(
    (p) => wallet.publicKey && p.wallet.equals(wallet.publicKey),
  );
  const showTheater = round.status === "settled" || round.tick > 0;

  return (
    <div className="space-y-8">
      <PreflightBanner />
      <header
        ref={headerRef}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="tnum font-mono text-base">
              {t.round.title} #{round.roundId.toString().slice(-6)}
            </h1>
            <StatusPill status={round.status} />
            {round.transparent && <Tag tone="open">{t.round.transparent}</Tag>}
            {delegated && <Tag tone="sealed">{t.round.onRollup}</Tag>}
          </div>
          <div className="tnum font-mono text-2xs text-muted">
            {participants.filter((p) => p.side === "founder").length} {t.rounds.founders} ·{" "}
            {participants.filter((p) => p.side === "builder").length} {t.rounds.builders} ·{" "}
            <span className="text-sealed">
              {round.rankingCount} {t.rounds.sealedLists}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {round.status === "open" && <Deadline deadlineTs={round.deadlineTs} />}
          <Explorer address={round.address.toBase58()} />
        </div>
      </header>

      <StickySummary
        round={round}
        participants={participants}
        anchor={headerRef}
      />

      {round.transparent && (
        <Reveal>
          <Panel className="border-open/25 bg-open/[0.03] p-4">
            <Note>
              <span className="text-open">{t.round.transparent}.</span>{" "}
              {t.round.transparentWarning}
            </Note>
          </Panel>
        </Reveal>
      )}

      <AnimatePresence mode="popLayout">
        {showTheater && (
          <motion.div
            key="theater"
            layout
            initial={reduce ? undefined : { y: 12 }}
            animate={reduce ? undefined : { y: 0 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={springLayout}
          >
            <ErrorBoundary>
              <MatchTheater
                round={round}
                participants={participants}
                meWallet={wallet.publicKey?.toBase58()}
              />
            </ErrorBoundary>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The trace this round published, checked against the chain in the
          reader's own browser. Renders nothing on a private round. */}
      <ErrorBoundary>
        <VerifyPanel round={round} />
      </ErrorBoundary>

      {/* The private counterpart: nothing to verify, and that is checkable. */}
      <ErrorBoundary>
        <PrivacyPanel round={round} participants={participants} />
      </ErrorBoundary>

      <RoundControls
        round={round}
        participants={participants}
        delegated={delegated}
        onDone={refresh}
      />

      <AnimatePresence mode="wait">
        {round.status === "open" && !me && (
          <motion.div
            key="join"
            initial={reduce ? undefined : { y: 12 }}
            animate={reduce ? undefined : { y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={springLayout}
          >
            <JoinForm round={round} delegated={delegated} onJoined={refresh} />
          </motion.div>
        )}

        {round.status === "open" && me && delegated && (
          <motion.div key="rank">
            <RankingBuilder
              round={round}
              me={me}
              participants={participants}
              onSubmitted={refresh}
            />
          </motion.div>
        )}

        {round.status === "open" && me && !delegated && (
          <motion.div
            key="wait"
            initial={false}
            animate={undefined}
            exit={reduce ? undefined : { opacity: 0 }}
          >
            <Panel className="p-6">
              <Note>
                {t.join.youAreIn}{" "}
                <span className="text-chalk">{me.handle}</span>. {t.join.waiting}
              </Note>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-6 sm:grid-cols-2">
        {(["founder", "builder"] as const).map((side) => (
          <div key={side} className="space-y-3">
            <Label>{side === "founder" ? t.rounds.founders : t.rounds.builders}</Label>
            <div className="space-y-1.5">
              {participants
                .filter((p) => p.side === side)
                .map((p) => (
                  <div
                    key={p.address.toBase58()}
                    className="flex items-center gap-2.5 font-mono text-xs"
                  >
                    <span className="tnum w-4 text-muted">{p.index}</span>
                    <span>{p.handle}</span>
                    {me && p.wallet.equals(me.wallet) && (
                      <span className="text-2xs text-sealed">{t.round.you}</span>
                    )}
                  </div>
                ))}
              {participants.filter((p) => p.side === side).length === 0 && (
                <Note>{t.ranking.nobody}</Note>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
