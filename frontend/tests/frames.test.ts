import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import { NONE } from "../lib/constants.ts";
import { framesFor } from "../lib/program.ts";
import type { RoundAccount } from "../lib/program.ts";

function round(over: Partial<RoundAccount> = {}): RoundAccount {
  return {
    address: PublicKey.default,
    authority: PublicKey.default,
    roundId: 1n,
    deadlineTs: 0,
    minPerSide: 2,
    founderCount: 3,
    builderCount: 3,
    rankingCount: 0,
    sealedCount: 0,
    tick: 0,
    pairs: [0, 1, 2],
    status: "settled",
    transparent: true,
    history: [],
    historyLen: 0,
    randomnessFulfilled: true,
    totalProposals: 0,
    settledTs: 0,
    ...over,
  } as RoundAccount;
}

describe("framesFor", () => {
  test("a private round has one frame: the outcome", () => {
    // It records nothing on purpose, so the result is the only thing there is.
    const f = framesFor(round({ transparent: false, history: [], historyLen: 0 }));
    assert.equal(f.length, 1);
    assert.deepEqual(f[0], [0, 1, 2]);
  });

  test("a settled transparent round does not repeat its last frame", () => {
    // The program records a frame after every round that made a proposal and
    // breaks before recording the one that makes none, so the last recorded
    // frame already is the final pairing. Appending it anyway ended every
    // replay on a step where nothing happens. All three demo rounds had it:
    // historyLen 2, tick 3, and frames two and three identical.
    const f = framesFor(
      round({
        history: [
          [1, 0, 2],
          [0, 1, 2],
        ],
        historyLen: 2,
        pairs: [0, 1, 2],
      }),
    );
    assert.equal(f.length, 2);
    assert.deepEqual(f[f.length - 1], [0, 1, 2]);
  });

  test("but it does append an outcome the history never reached", () => {
    // A round deeper than MAX_HISTORY stops recording while still working, so
    // its last recorded frame is not the end.
    const f = framesFor(
      round({
        history: [
          [1, 0, 2],
          [2, 0, 1],
        ],
        historyLen: 2,
        pairs: [0, 1, 2],
      }),
    );
    assert.equal(f.length, 3);
    assert.deepEqual(f[2], [0, 1, 2]);
  });

  test("historyLen bounds the frames, not the array's length", () => {
    // The account carries MAX_HISTORY slots whether or not they were written.
    const f = framesFor(
      round({
        history: [
          [1, 0, 2],
          [0, 1, 2],
          [NONE, NONE, NONE],
          [NONE, NONE, NONE],
        ],
        historyLen: 2,
        pairs: [0, 1, 2],
      }),
    );
    assert.equal(f.length, 2);
  });

  test("a round with no history and no pairs still yields one frame", () => {
    const f = framesFor(round({ history: [], historyLen: 0, pairs: [NONE, NONE, NONE] }));
    assert.equal(f.length, 1);
  });

  test("frames of different lengths are never treated as equal", () => {
    // A guard against comparing by prefix: a shorter recorded frame is a
    // different state, not the same one.
    const f = framesFor(
      round({ history: [[0, 1]], historyLen: 1, pairs: [0, 1, 2] }),
    );
    assert.equal(f.length, 2);
  });
});
