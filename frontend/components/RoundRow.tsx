"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { NONE } from "@/lib/constants";
import { RoundAccount } from "@/lib/program";
import { useT } from "@/lib/i18n";
import { useParticipants } from "@/hooks/useParticipants";
import { springPanel } from "@/lib/motion";
import { StatusPill, Tag } from "./ui";

/**
 * The outcome drawn small, always visible.
 *
 * A row that only says "6 founders · 6 builders" makes every round look
 * identical. This makes a settled round recognisable at a glance, and an
 * unsettled one visibly empty.
 */
function PairingThumb({ round }: { round: RoundAccount }) {
  const n = Math.max(round.founderCount, round.builderCount, 1);
  const H = 44;
  const rowY = (i: number) => ((i + 0.5) / n) * H;

  const links = round.pairs
    .slice(0, round.founderCount)
    .map((b, f) => ({ f, b }))
    .filter((l) => l.b !== NONE && l.b < round.builderCount);

  return (
    <svg width="56" height={H} viewBox={`0 0 56 ${H}`} aria-hidden className="shrink-0">
      {Array.from({ length: round.founderCount }).map((_, i) => (
        <circle key={`f${i}`} cx="4" cy={rowY(i)} r="1.7" fill="var(--edge-strong)" />
      ))}
      {Array.from({ length: round.builderCount }).map((_, i) => (
        <circle key={`b${i}`} cx="52" cy={rowY(i)} r="1.7" fill="var(--edge-strong)" />
      ))}
      {links.map((l) => (
        <line
          key={`${l.f}-${l.b}`}
          x1="4"
          x2="52"
          y1={rowY(l.f)}
          y2={rowY(l.b)}
          stroke="var(--sealed)"
          strokeWidth="1"
          opacity="0.75"
        />
      ))}
    </svg>
  );
}

/** Who actually ended up with whom, without opening the round. */
function Preview({ round }: { round: RoundAccount }) {
  const t = useT();
  const reduce = useReducedMotion();
  const { participants, loading } = useParticipants(round.address.toBase58(), true);

  if (loading || !participants) {
    return (
      <div className="grid gap-2 py-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-4 w-56 animate-pulse rounded bg-surface2" />
        ))}
      </div>
    );
  }

  const founders = participants.filter((p) => p.side === "founder");
  const builders = participants.filter((p) => p.side === "builder");

  if (founders.length === 0) {
    return <p className="py-1 text-2xs text-muted">{t.ranking.nobody}</p>;
  }

  return (
    <ul className="grid gap-1.5 py-1 sm:grid-cols-2 sm:gap-x-8">
      {founders.map((f, i) => {
        const b = round.pairs[f.index];
        const partner =
          b !== NONE ? builders.find((x) => x.index === b) : undefined;
        return (
          <motion.li
            key={f.address.toBase58()}
            initial={reduce ? undefined : { opacity: 0, x: -6 }}
            animate={reduce ? undefined : { opacity: 1, x: 0 }}
            transition={{ delay: reduce ? 0 : i * 0.04, duration: 0.25 }}
            className="flex items-center gap-2 font-mono text-2xs"
          >
            <span className="min-w-0 flex-1 truncate text-right text-chalk">
              {f.handle}
            </span>
            <span className={partner ? "text-sealed" : "text-dim"} aria-hidden>
              {partner ? "───" : "· ·"}
            </span>
            <span
              className={`min-w-0 flex-1 truncate ${
                partner ? "text-chalk" : "text-dim"
              }`}
            >
              {partner ? partner.handle : t.stats.unmatched}
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}

export function RoundRow({ round }: { round: RoundAccount }) {
  const t = useT();
  const reduce = useReducedMotion();
  const [peek, setPeek] = useState(false);

  // Pointer opens it on a laptop; on a phone there is no hover, so the chevron
  // is a real button and the row stays a plain link. Hijacking the tap would
  // cost a click to get where the row already goes.
  const open = () => setPeek(true);
  const close = () => setPeek(false);

  return (
    <div
      className="border-b border-edge"
      onMouseEnter={open}
      onMouseLeave={close}
      onFocusCapture={open}
      onBlurCapture={close}
    >
      <div className="flex items-center gap-5 py-5">
        <PairingThumb round={round} />

        <Link
          href={`/round/${round.address.toBase58()}`}
          className="group min-w-0 flex-1"
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tnum font-mono text-sm transition-colors group-hover:text-sealed">
                #{round.roundId.toString().slice(-6)}
              </span>
              <StatusPill status={round.status} />
              {round.transparent && <Tag tone="open">{t.round.transparent}</Tag>}
            </div>
            <div className="tnum font-mono text-2xs text-muted">
              {round.founderCount} {t.rounds.founders} · {round.builderCount}{" "}
              {t.rounds.builders} ·{" "}
              <span className="text-sealed">
                {round.rankingCount} {t.rounds.sealedLists}
              </span>
              {round.totalProposals > 0 && (
                <>
                  {" "}
                  · {round.totalProposals} {t.band.proposals}
                </>
              )}
            </div>
          </div>
        </Link>

        <button
          onClick={() => setPeek((v) => !v)}
          aria-expanded={peek}
          aria-label={t.rounds.peek}
          className="glass flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors hover:text-sealed sm:h-10 sm:w-10"
        >
          <motion.span
            animate={reduce ? undefined : { rotate: peek ? 90 : 0 }}
            transition={springPanel}
            className="flex"
          >
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </motion.span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {peek && (
          <motion.div
            initial={reduce ? undefined : { height: 0, opacity: 0 }}
            animate={reduce ? undefined : { height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={springPanel}
            className="overflow-hidden"
          >
            <div className="pb-5 pl-[76px] pr-2">
              <Preview round={round} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
