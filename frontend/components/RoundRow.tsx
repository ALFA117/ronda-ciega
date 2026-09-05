"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { NONE } from "@/lib/constants";
import { RoundAccount } from "@/lib/program";
import { useT } from "@/lib/i18n";
import { StatusPill, Tag } from "./ui";

/**
 * A round in the list, with its outcome drawn rather than counted.
 *
 * A row that only says "4 founders · 4 builders" makes every round look the
 * same. The thumbnail shows the actual pairing, so a settled round is
 * recognisable at a glance and an unsettled one visibly has nothing yet.
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

export function RoundRow({ round }: { round: RoundAccount }) {
  const t = useT();
  const reduce = useReducedMotion();

  return (
    <Link href={`/round/${round.address.toBase58()}`} className="group block">
      <motion.article
        whileHover={reduce ? undefined : { x: 4 }}
        transition={{ type: "spring", stiffness: 400, damping: 26 }}
        className="flex items-center gap-5 border-b border-edge py-5 transition-colors group-hover:border-edgeStrong"
      >
        <PairingThumb round={round} />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tnum font-mono text-sm">
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
              <> · {round.totalProposals} {t.band.proposals}</>
            )}
          </div>
        </div>

        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-sealed" />
      </motion.article>
    </Link>
  );
}
