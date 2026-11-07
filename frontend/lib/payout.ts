import type { RoundStatus } from "./program";

/**
 * What a participant can do with the money locked against a round, if anything.
 *
 * The page promised that a deposit pays the counterparty the matching chose
 * and that an unmatched one comes back, and both are true of the program —
 * `settle_pair` and `refund_escrow` exist, and neither needs anybody's
 * permission. But no control on the site ever called them: the one demo round
 * that paid out was paid by `scripts/escrow.ts`. A promise only a script can
 * keep is a promise this page was not keeping.
 *
 * The rules mirror `check_settle` and `check_refund` in the program, plus the
 * one condition the program states through its account types rather than a
 * `require!`: both instructions read the round as an account this program
 * owns, so they only run while the round is on L1. A delegated round is owned
 * by the delegation program there, and the instruction fails before any of
 * its checks — so the interface says "wait" instead of offering a button the
 * chain will refuse.
 *
 * Pure, and tested, for the same reason `steps.ts` is: getting it wrong does
 * not throw, it just puts somebody's money behind the wrong button.
 */

export type PayoutAction =
  /** A matched founder: pay the builder the matching chose. */
  | "pay"
  /** A matched builder: trigger the payment owed to you. Same instruction. */
  | "collect"
  /** Unmatched in a settled round, or the round expired without a result. */
  | "refund"
  /** Settled on the rollup, not yet back on L1: the payment waits for it. */
  | "waitSettled"
  /**
   * Expired without a result, and still on the rollup. The program only sends
   * a settled round back to L1, so nothing on this page can release it until
   * someone closes and settles the round.
   */
  | "waitExpired";

export interface PayoutInput {
  status: RoundStatus;
  deadlineTs: number;
  /** Seconds since the epoch. */
  now: number;
  /** Is the round account on L1 and owned by this program. */
  onL1: boolean;
  side: "founder" | "builder";
  /** The partner's index on the other side, or null when unmatched. */
  partner: number | null;
  /**
   * Lamports locked in the escrow that would move: a founder's own, or for a
   * builder, their partner's. Null when unknown — an RPC that did not answer
   * is not evidence that nothing is owed.
   */
  escrow: number | null;
}

export function payoutAction(i: PayoutInput): PayoutAction | null {
  if (!i.escrow || i.escrow <= 0) return null;

  if (i.side === "builder") {
    // A builder never deposits. What a builder can do is pull the payment
    // their partner's deposit owes them: `settle_pair` takes no signer, so
    // whoever sends it only pays the fee.
    if (i.status !== "settled" || i.partner === null) return null;
    return i.onL1 ? "collect" : "waitSettled";
  }

  if (i.status === "settled") {
    if (!i.onL1) return "waitSettled";
    return i.partner === null ? "refund" : "pay";
  }

  // Not settled. Before the deadline the money is simply locked, which is
  // what it is for; after it, `check_refund` releases it.
  if (i.now < i.deadlineTs) return null;
  return i.onL1 ? "refund" : "waitExpired";
}
