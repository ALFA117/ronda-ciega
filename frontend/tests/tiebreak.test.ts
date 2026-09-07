import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { pairingFor, seedBytes, sensitivity } from "../lib/tiebreak.ts";
import {
  UNRANKED,
  buildState,
  findBlockingPair,
  runMatching,
} from "../lib/matching.ts";

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

describe("estabilidad sobre listas parciales", () => {
  // The property test the /proof page runs, with the shape it was missing.
  //
  // It used to generate complete permutations only, and a receiver who ranked
  // everybody never needs a tie-break — so four hundred markets executed
  // break_tie exactly zero times. The branch the VRF exists to protect was
  // outside the guarantee the page presents.

  function prng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  function shuffled(n: number, rand: () => number, keep = n): number[] {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, Math.max(1, Math.min(keep, n)));
  }

  function sweep(cases: number) {
    let blocking = 0;
    let unconverged = 0;
    let withTies = 0;

    for (let seed = 1; seed <= cases; seed++) {
      const rand = prng(seed);
      const nF = 2 + Math.floor(rand() * 7);
      const nB = 2 + Math.floor(rand() * 7);
      const partial = seed % 2 === 0;
      const cut = (n: number) => (partial ? 1 + Math.floor(rand() * n) : n);

      const founders = Array.from({ length: nF }, () => shuffled(nB, rand, cut(nB)));
      const builders = Array.from({ length: nB }, () => shuffled(nF, rand, cut(nF)));
      const ms = buildState(founders, builders);

      for (const row of ms.builderRank) {
        let unranked = 0;
        for (let f = 0; f < nF; f++) if (row[f] === UNRANKED) unranked++;
        if (unranked >= 2) {
          withTies++;
          break;
        }
      }

      const res = runMatching(ms, nF, seedBytes(seed * 2654435761));
      if (!res.settled) unconverged++;
      if (findBlockingPair(res.pairs, founders, ms.builderRank, nF)) blocking++;
    }

    return { blocking, unconverged, withTies };
  }

  test("four hundred markets, no blocking pair, none unconverged", () => {
    const r = sweep(400);
    assert.equal(r.blocking, 0);
    assert.equal(r.unconverged, 0);
  });

  test("and a large share of them can actually reach the tie-break", () => {
    // This is the assertion that keeps the sweep honest. With complete lists
    // it would read zero, and the sweep would be checking a narrower claim
    // than the page makes for it.
    const r = sweep(400);
    assert.equal(r.withTies > 100, true, `only ${r.withTies} markets had ties`);
  });

  test("an all-complete sweep reaches no tie-break at all", () => {
    // The state this replaced, asserted so the reason is on the record.
    let withTies = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rand = prng(seed);
      const nF = 2 + Math.floor(rand() * 7);
      const nB = 2 + Math.floor(rand() * 7);
      const founders = Array.from({ length: nF }, () => shuffled(nB, rand));
      const builders = Array.from({ length: nB }, () => shuffled(nF, rand));
      const ms = buildState(founders, builders);
      for (const row of ms.builderRank) {
        let unranked = 0;
        for (let f = 0; f < nF; f++) if (row[f] === UNRANKED) unranked++;
        if (unranked >= 2) {
          withTies++;
          break;
        }
      }
    }
    assert.equal(withTies, 0);
  });
});
