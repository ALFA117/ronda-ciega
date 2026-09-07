import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  hasQuorum,
  plan,
  RANDOMNESS_RETRY_MS,
  shouldRetrySetup,
  type AutoState,
} from "../lib/autopilot.ts";

/** A round that is ready to settle the instant the deadline passes. */
function state(over: Partial<AutoState> = {}): AutoState {
  return {
    status: "open",
    delegated: true,
    randomnessFulfilled: true,
    founderCount: 4,
    builderCount: 4,
    minPerSide: 2,
    deadlineTs: 1000,
    now: 2000,
    ...over,
  };
}

describe("plan", () => {
  test("an undelegated open round is set up first", () => {
    assert.deepEqual(plan(state({ delegated: false })), {
      action: "setup",
      waiting: null,
      done: false,
      stalled: false,
    });
  });

  test("setup comes before every other consideration", () => {
    // No quorum, deadline not passed, no randomness — none of it matters
    // until the round is on the rollup, because nothing else can be sent.
    const p = plan(
      state({
        delegated: false,
        randomnessFulfilled: false,
        founderCount: 0,
        builderCount: 0,
        now: 0,
      }),
    );
    assert.equal(p.action, "setup");
  });

  test("delegated without randomness waits, it does not settle", () => {
    // run_matching returns RandomnessMissing rather than settling on
    // registration order, so settling here spends a transaction on a refusal.
    const p = plan(state({ randomnessFulfilled: false }));
    assert.equal(p.action, null);
    assert.equal(p.waiting, "randomness");
  });

  test("a round short on one side is stalled, not merely waiting", () => {
    // Four founders and one builder is not a slow round, it is a round that
    // needs another person. Saying "waiting" about it tells the operator to
    // do nothing, which is the one thing that cannot help.
    const p = plan(state({ builderCount: 1, minPerSide: 2 }));
    assert.equal(p.waiting, "quorum");
    assert.equal(p.stalled, true);
    assert.equal(p.action, null);
  });

  test("quorum is per side, never the total", () => {
    const p = plan(state({ founderCount: 8, builderCount: 0, minPerSide: 2 }));
    assert.equal(p.waiting, "quorum");
  });

  test("before the deadline it waits", () => {
    const p = plan(state({ now: 999, deadlineTs: 1000 }));
    assert.equal(p.waiting, "deadline");
    assert.equal(p.stalled, false);
  });

  test("the deadline is inclusive — at the second, it settles", () => {
    // The program compares the same way. An off-by-one here would leave the
    // round sitting for a whole poll interval after it became settleable.
    assert.equal(plan(state({ now: 1000, deadlineTs: 1000 })).action, "settle");
  });

  test("everything satisfied: settle", () => {
    assert.equal(plan(state()).action, "settle");
  });

  test("sealing resumes settle rather than starting over", () => {
    // close_round requires status Open, so a sequence that stopped after it
    // must not begin there again. Sealing used to have no button at all.
    assert.equal(plan(state({ status: "sealing" })).action, "settle");
  });

  test("matching resumes settle", () => {
    assert.equal(plan(state({ status: "matching" })).action, "settle");
  });

  test("a half-settled round resumes even with no quorum and no deadline", () => {
    // Quorum and deadline gate close_round. Once the round is past Open they
    // are history, and re-checking them would strand it forever.
    const p = plan(
      state({ status: "matching", founderCount: 0, builderCount: 0, now: 0 }),
    );
    assert.equal(p.action, "settle");
  });

  test("settled and still delegated: destroy the private accounts", () => {
    assert.equal(plan(state({ status: "settled" })).action, "finish");
  });

  test("settled and back on L1 is done", () => {
    const p = plan(state({ status: "settled", delegated: false }));
    assert.deepEqual(p, { action: null, waiting: null, done: true, stalled: false });
  });

  test("done is never also an action", () => {
    // Running finish on an undelegated round sends undelegate_round to a
    // rollup that no longer holds it.
    const p = plan(state({ status: "settled", delegated: false }));
    assert.equal(p.action, null);
  });
});

describe("hasQuorum", () => {
  test("both sides at the minimum", () => {
    assert.equal(hasQuorum(state({ founderCount: 2, builderCount: 2, minPerSide: 2 })), true);
  });

  test("one side under", () => {
    assert.equal(hasQuorum(state({ founderCount: 2, builderCount: 1, minPerSide: 2 })), false);
  });

  test("a large total does not substitute for a side", () => {
    assert.equal(hasQuorum(state({ founderCount: 99, builderCount: 1, minPerSide: 2 })), false);
  });
});

describe("shouldRetrySetup", () => {
  test("only ever chases a missing randomness request", () => {
    // Re-running setup while waiting on a deadline would delegate, create and
    // request all over again, every tick, for as long as the round is open.
    assert.equal(shouldRetrySetup("deadline", null, 0), false);
    assert.equal(shouldRetrySetup("quorum", null, 0), false);
    assert.equal(shouldRetrySetup(null, null, 0), false);
  });

  test("the first attempt is immediate", () => {
    assert.equal(shouldRetrySetup("randomness", null, 0), true);
  });

  test("and then rate-limited", () => {
    assert.equal(shouldRetrySetup("randomness", 0, RANDOMNESS_RETRY_MS - 1), false);
    assert.equal(shouldRetrySetup("randomness", 0, RANDOMNESS_RETRY_MS), true);
  });
});
