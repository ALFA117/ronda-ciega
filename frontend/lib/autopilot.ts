import type { RoundAccount } from "./program";

/**
 * What the round needs next, decided from its state alone.
 *
 * Running a round is three clicks separated by two waits: set it up, come back
 * when the deadline has passed and the oracle has answered, settle it, then
 * come back again to destroy the private accounts and hand the round to L1.
 * The waits are the problem. Nobody is at the keyboard when a deadline passes
 * at three in the morning, and a round that settles late is a round whose
 * participants were told to wait for no reason.
 *
 * Every one of those steps is already driven by the operator key, which asks
 * the wallet for nothing. So the only reason a person had to be present was
 * that the interface required a click. This decides the same thing the person
 * was deciding, from the same information, and the component does it.
 *
 * Kept pure and separate because the sequencing is where this goes wrong in
 * ways nothing reports: running `settle` a moment too early wastes a
 * transaction on a refusal, and running `finish` a moment too early destroys
 * the working memory of a round that has not produced its pairings yet.
 */

export type AutoAction = "setup" | "settle" | "finish";

/** Why the round is not moving. Each one resolves on its own, or does not. */
export type AutoWaiting =
  /** The deadline has not passed. Resolves by itself. */
  | "deadline"
  /** The VRF callback has not landed. Resolves by itself, usually seconds. */
  | "randomness"
  /** Not enough people on one side. Only a human can resolve this. */
  | "quorum";

export interface AutoState {
  status: RoundAccount["status"];
  delegated: boolean;
  randomnessFulfilled: boolean;
  founderCount: number;
  builderCount: number;
  minPerSide: number;
  deadlineTs: number;
  /** Seconds. Passed in rather than read so this stays testable. */
  now: number;
}

export interface AutoPlan {
  /** The instruction sequence to run right now, or null. */
  action: AutoAction | null;
  /** What it is waiting for, when it is waiting rather than acting. */
  waiting: AutoWaiting | null;
  /** Nothing left to do: the round is settled and back on L1. */
  done: boolean;
  /**
   * True when only a person can move this forward. Autopilot keeps watching —
   * people can still join — but it must not present itself as making progress.
   */
  stalled: boolean;
}

const DONE: AutoPlan = { action: null, waiting: null, done: true, stalled: false };

const act = (action: AutoAction): AutoPlan => ({
  action,
  waiting: null,
  done: false,
  stalled: false,
});

const wait = (waiting: AutoWaiting, stalled = false): AutoPlan => ({
  action: null,
  waiting,
  done: false,
  stalled,
});

export function hasQuorum(s: AutoState): boolean {
  // Both sides, not the total. A round with six founders and no builders has
  // twelve participants and cannot be matched.
  return s.founderCount >= s.minPerSide && s.builderCount >= s.minPerSide;
}

export function plan(s: AutoState): AutoPlan {
  // Settled and back on L1: the private accounts are gone and there is no
  // instruction left to send.
  if (s.status === "settled" && !s.delegated) return DONE;

  // Settled but still delegated: destroy the rankings and the working memory,
  // then undelegate. Order matters and `finish` owns it.
  if (s.status === "settled") return act("finish");

  // Half-settled. `settle` is written to resume from either of these, and
  // leaving a round parked here is what strands it with no way forward.
  if (s.status === "sealing" || s.status === "matching") return act("settle");

  // Everything below is status Open.

  // Setup is idempotent: it delegates if needed, creates the working memory if
  // it is missing, and requests randomness if none has landed. Re-running it
  // is how a partially-completed setup gets completed.
  if (!s.delegated) return act("setup");

  // Delegated but no randomness. This is ambiguous from the outside — a
  // request may be in flight, or may never have been sent — and re-running
  // setup is the only way to tell the difference. The caller rate-limits it;
  // reporting the wait is this function's job.
  if (!s.randomnessFulfilled) return wait("randomness");

  // A round that cannot reach quorum cannot be closed, and no amount of
  // waiting fixes it. People can still join, so keep watching, but say that
  // the thing it is waiting for is other people.
  if (!hasQuorum(s)) return wait("quorum", true);

  if (s.now < s.deadlineTs) return wait("deadline");

  return act("settle");
}

/**
 * Whether `setup` should be re-sent to chase a randomness request that never
 * landed. Sending it on every tick would spend the operator key's balance on
 * duplicate requests; never sending it strands a round whose request was lost.
 */
export const RANDOMNESS_RETRY_MS = 90_000;

export function shouldRetrySetup(
  waiting: AutoWaiting | null,
  lastSetupAt: number | null,
  now: number,
): boolean {
  if (waiting !== "randomness") return false;
  if (lastSetupAt === null) return true;
  return now - lastSetupAt >= RANDOMNESS_RETRY_MS;
}
