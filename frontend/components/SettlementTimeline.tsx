"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { motion, useReducedMotion } from "framer-motion";
import { useT, useLocale } from "@/lib/i18n";
import { RoundAccount } from "@/lib/program";
import {
  firstInstructionTime,
  humanGap,
  Milestone,
  MilestoneId,
  timeline,
} from "@/lib/timeline";
import { Label, Note, Panel } from "./ui";

const TONE: Record<MilestoneId, string> = {
  opened: "text-muted",
  closed: "text-muted",
  settled: "text-sealed",
  paid: "text-settled",
};

/**
 * How long each part of this round actually took.
 *
 * The page claims the matching runs inside one transaction and that the payout
 * is a second one. A finished round carries the evidence for both, and the
 * evidence is better than the claim: the gap between the deadline and
 * `settled_ts` is the algorithm, in seconds, checkable against an explorer.
 *
 * The times are labelled by where they came from, which sounds pedantic until
 * you notice that one of them is self-reported. `round_id` is `Date.now()` at
 * creation — whoever opened the round chose that number, and a round could
 * carry any value there. Block times are what the chain saw. Both are shown,
 * marked differently, because hiding the weaker one would leave a gap and
 * presenting it as the stronger one would be a small lie in a project whose
 * entire argument is about what can be verified.
 */
export function SettlementTimeline({
  round,
  paidAt,
}: {
  round: RoundAccount;
  /** Block time of a payout, when the caller knows of one. */
  paidAt?: number | null;
}) {
  const { connection } = useConnection();
  const { locale } = useLocale();
  const t = useT();
  const reduce = useReducedMotion();
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [settlePaidAt, setSettlePaidAt] = useState<number | null>(null);

  // Two facts off one history. The oldest transaction that ever touched this
  // round is the one that made it, which turns a self-reported time into a
  // record. And the payout is found by its own name: Anchor writes
  // `Instruction: SettlePair` into the logs before running it, so there is no
  // need to know which participant was paid — which matters, because their
  // escrow account is closed by the payment and cannot be asked afterwards.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const sigs = await connection.getSignaturesForAddress(round.address, {
          limit: 1000,
        });
        const good = sigs.filter(
          (s) => !s.err && typeof s.blockTime === "number",
        );
        const oldest = good.reduce<number | null>(
          (min, s) => (min === null || s.blockTime! < min ? s.blockTime! : min),
          null,
        );
        if (live) setOpenedAt(oldest);

        // Only after the matching, and only a handful: fetching the whole
        // history transaction by transaction would be a dozen round-trips for
        // one timestamp on a panel most readers scroll past.
        if (round.settledTs > 0) {
          const after = good
            .filter((s) => s.blockTime! >= round.settledTs)
            .sort((a, b) => a.blockTime! - b.blockTime!)
            .slice(0, 6);
          const txs = await Promise.all(
            after.map((s) =>
              connection
                .getTransaction(s.signature, {
                  maxSupportedTransactionVersion: 0,
                  commitment: "confirmed",
                })
                .catch(() => null),
            ),
          );
          const paid = firstInstructionTime(
            txs
              .filter((tx): tx is NonNullable<typeof tx> => tx !== null)
              .map((tx) => ({
                blockTime: tx.blockTime,
                logs: tx.meta?.logMessages ?? null,
              })),
            "SettlePair",
          );
          if (live) setSettlePaidAt(paid);
        }
      } catch {
        // An RPC that will not answer leaves round_id to speak, and it will
        // be labelled as the claim it is.
        if (live) setOpenedAt(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [connection, round.address.toBase58(), round.settledTs]);

  const steps: Milestone[] = timeline({
    openedAt,
    roundId: round.roundId,
    deadlineTs: round.deadlineTs,
    settledTs: round.settledTs,
    paidAt: paidAt ?? settlePaidAt,
    now: Math.floor(Date.now() / 1000),
  });

  const clock = (at: number) =>
    new Date(at * 1000).toLocaleTimeString(locale === "es" ? "es-MX" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-edge px-5 py-3.5">
        <Label>{t.timeline.title}</Label>
      </div>

      <ol className="divide-y divide-edge">
        {steps.map((m, i) => {
          const copy = t.timeline.steps[m.id];
          const happened = m.at !== null;
          return (
            <motion.li
              key={m.id}
              initial={reduce ? undefined : { opacity: 0.55 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduce ? 0 : i * 0.05, duration: 0.3 }}
              className="grid grid-cols-[5.5rem_1fr_auto] items-baseline gap-x-3 gap-y-1 px-5 py-3.5 sm:grid-cols-[6.5rem_1fr_auto]"
            >
              <span
                className={`tnum font-mono text-2xs ${
                  happened ? "text-chalk" : "text-dim"
                }`}
              >
                {happened ? clock(m.at!) : "—"}
              </span>

              <span className="min-w-0">
                <span className={`text-sm ${happened ? TONE[m.id] : "text-dim"}`}>
                  {copy.name}
                </span>
                {/* Said on the row it applies to, not in a footnote. */}
                {m.source !== "chain" && happened && (
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-dim">
                    {t.timeline.source[m.source as "claimed" | "scheduled"]}
                  </span>
                )}
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                  {copy.body}
                </span>
              </span>

              <span
                className={`tnum justify-self-end font-mono text-2xs ${
                  m.id === "settled" ? "text-sealed" : "text-muted"
                }`}
              >
                {m.since === null ? "" : `+${humanGap(m.since)}`}
              </span>
            </motion.li>
          );
        })}
      </ol>

      <div className="border-t border-edge px-5 py-3.5">
        <Note>{t.timeline.note}</Note>
      </div>
    </Panel>
  );
}
