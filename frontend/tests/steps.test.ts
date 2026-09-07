import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NONE } from "../lib/constants.ts";
import { currentStep, isBystander, partnerIndex } from "../lib/steps.ts";

const open = { open: true, connected: true, joined: true, delegated: true };

describe("currentStep", () => {
  test("a visitor with no wallet is asked to connect, whatever else is true", () => {
    for (const o of [true, false]) {
      for (const d of [true, false]) {
        assert.equal(
          currentStep({ open: o, connected: false, joined: false, delegated: d }),
          "connect",
        );
      }
    }
  });

  test("connected, round open, not joined yet", () => {
    assert.equal(currentStep({ ...open, joined: false }), "join");
  });

  test("joined but the round is still on L1: ranking is not possible yet", () => {
    // The private account cannot exist before the round is delegated, so
    // offering the ranking form here would offer a transaction that fails.
    assert.equal(currentStep({ ...open, delegated: false }), "wait");
  });

  test("joined and delegated is the one state where a list can be sealed", () => {
    assert.equal(currentStep(open), "rank");
  });

  test("a closed round shows the result, even to someone mid-journey", () => {
    // Deadline passing while a participant had not sealed a list must not
    // leave them looking at a ranking form the program will now refuse.
    assert.equal(currentStep({ ...open, open: false }), "result");
    assert.equal(
      currentStep({ open: false, connected: true, joined: false, delegated: true }),
      "result",
    );
  });
});

describe("isBystander", () => {
  test("closed round, never joined: no rail", () => {
    assert.equal(isBystander({ open: false, joined: false }), true);
  });

  test("a participant still sees their own closed round", () => {
    assert.equal(isBystander({ open: false, joined: true }), false);
  });

  test("an open round always shows the rail — that is the point of it", () => {
    assert.equal(isBystander({ open: true, joined: false }), false);
    assert.equal(isBystander({ open: true, joined: true }), false);
  });
});

describe("partnerIndex", () => {
  // Founder 0 holds builder 2, founder 1 holds builder 0, founder 2 unmatched.
  const pairs = [2, 0, NONE, NONE];

  test("a founder reads their own slot", () => {
    assert.equal(partnerIndex(pairs, "founder", 0), 2);
    assert.equal(partnerIndex(pairs, "founder", 1), 0);
  });

  test("a builder is found by searching, not by indexing", () => {
    // Indexing pairs[2] for builder 2 would return NONE and report a matched
    // builder as unmatched — the failure this whole function exists to avoid.
    assert.equal(partnerIndex(pairs, "builder", 2), 0);
    assert.equal(partnerIndex(pairs, "builder", 0), 1);
  });

  test("builder 0 is matched even though 0 is also the falsy index", () => {
    assert.equal(partnerIndex([0], "builder", 0), 0);
    assert.notEqual(partnerIndex([0], "builder", 0), null);
  });

  test("unmatched reads as null on both sides", () => {
    assert.equal(partnerIndex(pairs, "founder", 2), null);
    assert.equal(partnerIndex(pairs, "builder", 1), null);
    assert.equal(partnerIndex(pairs, "builder", 3), null);
  });

  test("an index past the end of pairs is unmatched, not undefined", () => {
    assert.equal(partnerIndex(pairs, "founder", 99), null);
  });
});
