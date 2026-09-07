import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { pairingFor, seedBytes, sensitivity } from "../lib/tiebreak.ts";

/** 32 bytes, all the same value: a seed with no internal variation. */
const flat = (v: number) => new Uint8Array(32).fill(v);


describe("pairingFor", () => {
  test("a market with no ties gives the same answer under every seed", () => {
    // Everyone ranks everyone, so no receiver is ever comparing two proposers
    // it has not ranked. There is nothing for the tie-break to decide.
    const founders = [
      [0, 1],
      [1, 0],
    ];
    const builders = [
      [0, 1],
      [1, 0],
    ];
    const a = pairingFor(founders, builders, 2, seedBytes(1));
    const b = pairingFor(founders, builders, 2, seedBytes(999));
    assert.deepEqual(a, b);
  });

  test("returns one slot per founder, not the whole padded array", () => {
    const p = pairingFor([[0]], [[0]], 1, flat(1));
    assert.equal(p.length, 1);
  });

  test("terminates on a market where nobody ranked anybody", () => {
    // Empty lists mean no proposals at all. If this hangs, the loop bound is
    // wrong and the tab freezes rather than erroring.
    const p = pairingFor([[], []], [[], []], 2, flat(7));
    assert.equal(p.length, 2);
  });
});

describe("sensitivity", () => {
  const founders = [
    [0, 1],
    [1, 0],
  ];
  const builders = [
    [0, 1],
    [1, 0],
  ];

  test("counts the baseline among the seeds it tried", () => {
    const s = sensitivity(founders, builders, 2, seedBytes(1), [
      seedBytes(2),
      seedBytes(3),
    ]);
    assert.equal(s.tried, 3);
  });

  test("a market with no ties reports no difference and one outcome", () => {
    const s = sensitivity(founders, builders, 2, seedBytes(1), [
      seedBytes(2),
      seedBytes(3),
      seedBytes(4),
    ]);
    assert.equal(s.differing, 0);
    assert.equal(s.distinct, 1);
  });

  test("a market whose ties matter reports it", () => {
    // Builder 0 ranked nobody, so when both founders propose to it the only
    // thing separating them is the seed. That is precisely the case the VRF
    // exists for, and by index order founder 0 would always win.
    const f = [[0], [0]];
    const b = [[], []];
    const alternatives = Array.from({ length: 12 }, (_, i) => seedBytes(i + 2));
    const s = sensitivity(f, b, 2, seedBytes(1), alternatives);
    assert.equal(s.tried, 13);
    assert.equal(s.differing > 0, true);
    assert.equal(s.distinct, 2);
  });

  test("with no alternatives it reports one seed and no difference", () => {
    const s = sensitivity(founders, builders, 2, seedBytes(1), []);
    assert.deepEqual(s, { tried: 1, differing: 0, distinct: 1 });
  });

  test("distinct never counts an outcome twice", () => {
    // Two identical seeds are one outcome, however many times they are run.
    const f = [[0], [0]];
    const b = [[], []];
    const s = sensitivity(f, b, 2, seedBytes(1), [seedBytes(5), seedBytes(5)]);
    assert.equal(s.distinct <= 2, true);
  });
});

describe("seedBytes", () => {
  test("adjacent seeds do not share a byte position", () => {
    // The bug: an LCG's first output byte was 60 for every small seed, so
    // break_tie compared a varying byte against a frozen one.
    const first = new Set<number>();
    for (let s = 1; s <= 50; s++) first.add(seedBytes(s)[0]);
    assert.equal(first.size > 40, true, `only ${first.size} distinct values`);
  });

  test("the tie-break it feeds is not biased toward the challenger", () => {
    // break_tie(rnd, 0, 1, 0) compares rnd[1] against rnd[0]. Under the LCG
    // the challenger won 150 times in 200. Fair is about half.
    let wins = 0;
    const n = 2000;
    for (let s = 1; s <= n; s++) {
      const r = seedBytes(s);
      if (r[1] > r[0]) wins++;
    }
    const share = wins / n;
    assert.equal(share > 0.45 && share < 0.55, true, `challenger won ${share}`);
  });

  test("every byte position is well spread, not just the first", () => {
    for (const i of [0, 1, 7, 31]) {
      const seen = new Set<number>();
      for (let s = 1; s <= 300; s++) seen.add(seedBytes(s)[i]);
      assert.equal(seen.size > 150, true, `byte ${i}: ${seen.size} distinct`);
    }
  });

  test("deterministic, so a shared screenshot and a rerun agree", () => {
    assert.deepEqual([...seedBytes(42)], [...seedBytes(42)]);
  });

  test("seed zero does not degenerate to all zeroes", () => {
    const z = seedBytes(0);
    assert.equal(new Set(z).size > 1, true);
  });
});
