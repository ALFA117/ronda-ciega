/**
 * How long each part of a round actually took, from the chain's own record.
 *
 * The page has been claiming "the matching runs in one transaction" and
 * "settlement is a second one" in prose. A round that has finished carries the
 * evidence for both, and it is more convincing than the sentence: the gap
 * between the deadline and `settled_ts` is the algorithm, in seconds somebody
 * can check against an explorer.
 *
 * Kept pure and separate from the component for the reason `check_closable`
 * is: the arithmetic is easy to get subtly wrong — an unknown time treated as
 * zero produces a fifty-six-year gap, and 1970 has shown up in this project
 * once already — and none of it needs a browser to be exercised.
 */

/** A point in a round's life. Ordered, and always all of them. */
export type MilestoneId = "opened" | "closed" | "settled" | "paid";

export const MILESTONES: readonly MilestoneId[] = [
  "opened",
  "closed",
  "settled",
  "paid",
] as const;

/** Where a timestamp came from, because the two are not equally trustworthy. */
export type Source =
  /** A block time. The chain saw it happen. */
  | "chain"
  /** Taken from `round_id`, which whoever opened the round chose. */
  | "claimed"
  /** The deadline, which is a promise about the future until it passes. */
  | "scheduled"
  | "unknown";

export interface Milestone {
  id: MilestoneId;
  /** Unix seconds, or null when it has not happened yet. */
  at: number | null;
  source: Source;
  /** Seconds since the previous milestone, when both are known. */
  since: number | null;
}

export interface TimelineInput {
  /** Block time of the oldest transaction touching the round, if known. */
  openedAt?: number | null;
  /** `round_id` is `Date.now()` at creation — milliseconds, and self-reported. */
  roundId?: bigint | number | null;
  deadlineTs: number;
  /** Zero until the matching converges. */
  settledTs: number;
  /** Block time of the payout, when one has happened. */
  paidAt?: number | null;
  /** Seconds now, so the caller decides what "yet" means. */
  now: number;
}

/**
 * When the round opened.
 *
 * The block time is the record; `round_id` is whatever the creator's clock
 * said, and a round could carry any number there. Both are offered, labelled
 * differently, because refusing to show a time at all would be worse — and
 * quietly presenting a claim as an observation would be worse than that.
 */
function opening(input: TimelineInput): { at: number | null; source: Source } {
  if (typeof input.openedAt === "number" && input.openedAt > 0) {
    return { at: input.openedAt, source: "chain" };
  }
  if (input.roundId !== null && input.roundId !== undefined) {
    const ms = Number(input.roundId);
    // Sanity, not superstition: round ids are milliseconds since the epoch, so
    // anything before 2001 or after 2100 is a number that means something else.
    if (Number.isFinite(ms) && ms > 1_000_000_000_000 && ms < 4_100_000_000_000) {
      return { at: Math.floor(ms / 1000), source: "claimed" };
    }
  }
  return { at: null, source: "unknown" };
}

export function timeline(input: TimelineInput): Milestone[] {
  const open = opening(input);

  const closed =
    input.deadlineTs > 0
      ? {
          at: input.deadlineTs,
          // A deadline in the future has not happened; it is an appointment.
          source: (input.deadlineTs <= input.now ? "chain" : "scheduled") as Source,
        }
      : { at: null, source: "unknown" as Source };

  const settled =
    input.settledTs > 0
      ? { at: input.settledTs, source: "chain" as Source }
      : { at: null, source: "unknown" as Source };

  const paid =
    typeof input.paidAt === "number" && input.paidAt > 0
      ? { at: input.paidAt, source: "chain" as Source }
      : { at: null, source: "unknown" as Source };

  const raw = [
    { id: "opened" as const, ...open },
    { id: "closed" as const, ...closed },
    { id: "settled" as const, ...settled },
    { id: "paid" as const, ...paid },
  ];

  // A gap is only measured between two things that both happened. Anything
  // else is a subtraction against zero, which is how 1970 gets on a page.
  return raw.map((m, i) => {
    const prev = i > 0 ? raw[i - 1] : null;
    const since =
      m.at !== null && prev && prev.at !== null && m.at >= prev.at
        ? m.at - prev.at
        : null;
    return { ...m, since };
  });
}

/**
 * A duration a person can read, in the smallest unit that stays honest.
 *
 * Sub-second gaps are real here — the matching converges inside one
 * transaction — and rounding those up to "1s" would erase the only number on
 * the page that makes the case for running it in a rollup.
 */
export function humanGap(seconds: number): string {
  if (seconds < 1) return "<1 s";
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172_800) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86_400)} d`;
}

/**
 * The block time of the first transaction whose logs name an instruction.
 *
 * Anchor writes `Program log: Instruction: SettlePair` before it runs one, so
 * a payout can be found without decoding events or knowing which participant
 * to ask about. The alternative was reading the newest signature on the round
 * and calling it the payment, which is wrong the moment a refund lands after
 * it — and on a round with an unmatched buyer, one always does.
 *
 * Pure, and takes only what it reads, so the ordering rule below is a test
 * rather than a hope: transactions come back newest-first from the RPC and the
 * earliest payout is the one that matters, so it sorts rather than trusting.
 */
export function firstInstructionTime(
  txs: { blockTime?: number | null; logs?: string[] | null }[],
  instruction: string,
): number | null {
  const marker = `Instruction: ${instruction}`;
  const times = txs
    .filter((tx) => (tx.logs ?? []).some((l) => l.includes(marker)))
    .map((tx) => tx.blockTime)
    .filter((t): t is number => typeof t === "number" && t > 0);
  return times.length ? Math.min(...times) : null;
}
