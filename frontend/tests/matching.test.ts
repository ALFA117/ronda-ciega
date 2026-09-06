import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  NONE,
  UNRANKED,
  advanceOneRound,
  breakTie,
  buildState,
  findBlockingPair,
  runMatching,
} from "./oracle/gale-shapley.ts";

/** Seeded so a failure is reproducible instead of a story about one CI run. */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function shuffled(n: number, rand: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomness(seed: number): Uint8Array {
  const rand = prng(seed);
  return Uint8Array.from({ length: 32 }, () => Math.floor(rand() * 256));
}

describe("Gale–Shapley: propiedades que deben cumplirse siempre", () => {
  test("termina y no deja pares bloqueantes (500 casos aleatorios)", () => {
    let unmatchedSeen = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const rand = prng(seed);
      const nF = 1 + Math.floor(rand() * 8);
      const nB = 1 + Math.floor(rand() * 8);

      const founderRankings = Array.from({ length: nF }, () => shuffled(nB, rand));
      const builderRankings = Array.from({ length: nB }, () => shuffled(nF, rand));
      const ms = buildState(founderRankings, builderRankings);
      const rnd = randomness(seed);

      const res = runMatching(ms, nF, rnd);

      assert.equal(res.settled, true, `semilla ${seed}: no convergió`);

      const blocking = findBlockingPair(res.pairs, founderRankings, ms.builderRank, nF);
      assert.equal(
        blocking,
        null,
        `semilla ${seed}: par bloqueante ${JSON.stringify(blocking)}`,
      );

      // A builder is never held by two founders.
      const taken = res.pairs.slice(0, nF).filter((b) => b !== NONE);
      assert.equal(new Set(taken).size, taken.length, `semilla ${seed}: builder duplicado`);

      // With complete lists on both sides, min(nF,nB) pairs is the maximum
      // possible and Gale–Shapley always reaches it.
      assert.equal(taken.length, Math.min(nF, nB), `semilla ${seed}: emparejó de menos`);
      if (taken.length < nF) unmatchedSeen++;
    }
    assert.ok(unmatchedSeen > 0, "el generador nunca produjo lados desiguales");
  });

  test("listas truncadas: sigue siendo estable aunque queden solos", () => {
    for (let seed = 1000; seed < 1200; seed++) {
      const rand = prng(seed);
      const nF = 2 + Math.floor(rand() * 6);
      const nB = 2 + Math.floor(rand() * 6);
      // Each founder ranks only a prefix of the builders.
      const founderRankings = Array.from({ length: nF }, () => {
        const full = shuffled(nB, rand);
        return full.slice(0, 1 + Math.floor(rand() * nB));
      });
      const builderRankings = Array.from({ length: nB }, () => {
        const full = shuffled(nF, rand);
        return full.slice(0, 1 + Math.floor(rand() * nF));
      });
      const ms = buildState(founderRankings, builderRankings);
      const res = runMatching(ms, nF, randomness(seed));
      assert.equal(res.settled, true, `semilla ${seed}: no convergió`);
      assert.equal(
        findBlockingPair(res.pairs, founderRankings, ms.builderRank, nF),
        null,
        `semilla ${seed}: par bloqueante con listas truncadas`,
      );
    }
  });

  test("es determinista: misma entrada y misma aleatoriedad, mismo resultado", () => {
    const founderRankings = [[0, 1, 2], [2, 0, 1], [1, 2, 0]];
    const builderRankings = [[2, 1, 0], [0, 2, 1], [1, 0, 2]];
    const rnd = randomness(7);
    const a = runMatching(buildState(founderRankings, builderRankings), 3, rnd);
    const b = runMatching(buildState(founderRankings, builderRankings), 3, rnd);
    assert.deepEqual(a.pairs, b.pairs);
    assert.equal(a.totalProposals, b.totalProposals);
    assert.equal(a.ticks, b.ticks);
  });

  test("la aleatoriedad decide los empates, no el orden de registro", () => {
    // Two founders, one builder who ranked neither: a pure tie.
    const founderRankings = [[0], [0]];
    const builderRankings: number[][] = [[]];
    let firstWins = 0;
    let secondWins = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const ms = buildState(founderRankings, builderRankings);
      const res = runMatching(ms, 2, randomness(seed));
      if (res.pairs[0] === 0) firstWins++;
      else if (res.pairs[1] === 0) secondWins++;
    }
    assert.equal(firstWins + secondWins, 200, "alguien debía quedarse con el builder");
    assert.ok(
      secondWins > 20,
      `el que se registró segundo ganó ${secondWins}/200: el desempate está sesgado al orden de registro`,
    );
  });

  test("UNRANKED pierde contra cualquier posición real", () => {
    // Builder 0 ranked founder 1 only. Founder 0 proposes first and is held,
    // then founder 1 displaces them despite arriving second.
    const founderRankings = [[0], [0]];
    const builderRankings = [[1]];
    const ms = buildState(founderRankings, builderRankings);
    assert.equal(ms.builderRank[0][1], 0, "el ranqueado debe tener posición 0");
    assert.equal(ms.builderRank[0][0], UNRANKED, "el no ranqueado debe ser UNRANKED");
    const res = runMatching(ms, 2, randomness(3));
    assert.equal(res.pairs[1], 0, "el builder debió quedarse con quien sí ranqueó");
    assert.equal(res.pairs[0], NONE);
  });

  test("nadie propone dos veces al mismo builder", () => {
    const founderRankings = [[0, 1], [0, 1], [1, 0]];
    const builderRankings = [[2, 0, 1], [1, 2, 0]];
    const ms = buildState(founderRankings, builderRankings);
    const pairs = new Array(16).fill(NONE);
    const seen = new Set<string>();
    const rnd = randomness(11);
    for (let tick = 0; tick < 10; tick++) {
      const before = ms.cursor.slice(0, 3);
      const n = advanceOneRound(ms, pairs, 3, rnd);
      for (let f = 0; f < 3; f++) {
        if (ms.cursor[f] !== before[f]) {
          const key = `${f}->${ms.founderRanking[f][before[f]]}`;
          assert.ok(!seen.has(key), `propuesta repetida ${key}`);
          seen.add(key);
        }
      }
      if (n === 0) break;
    }
  });

  test("desempate: byte igual cae a orden de índice, distinto gana el mayor", () => {
    const flat = new Uint8Array(32).fill(9);
    assert.equal(breakTie(flat, 0, 1, 2), true, "empate: gana el índice menor");
    assert.equal(breakTie(flat, 0, 2, 1), false);
    const r = new Uint8Array(32);
    r[(0 * 3 + 1) % 32] = 200;
    r[(0 * 3 + 2) % 32] = 10;
    assert.equal(breakTie(r, 0, 1, 2), true, "gana el byte mayor");
    assert.equal(breakTie(r, 0, 2, 1), false);
  });

  test("ronda vacía y de un solo participante no rompen nada", () => {
    const empty = runMatching(buildState([], []), 0, randomness(1));
    assert.equal(empty.settled, true);
    assert.equal(empty.totalProposals, 0);

    const solo = runMatching(buildState([[0]], [[0]]), 1, randomness(1));
    assert.equal(solo.pairs[0], 0);
    assert.equal(solo.settled, true);
  });

  test("un founder sin lista queda sin pareja pero no cuelga la ronda", () => {
    const ms = buildState([[], [0]], [[1, 0]]);
    const res = runMatching(ms, 2, randomness(5));
    assert.equal(res.settled, true);
    assert.equal(res.pairs[0], NONE, "sin lista no puede proponer");
    assert.equal(res.pairs[1], 0);
  });
});
