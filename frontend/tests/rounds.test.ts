import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import { NONE } from "../lib/constants.ts";
import { pickTickerRound } from "../lib/rounds.ts";
import type { RoundAccount } from "../lib/program.ts";

function round(over: Partial<RoundAccount> = {}): RoundAccount {
  return {
    address: PublicKey.default,
    authority: PublicKey.default,
    roundId: 1n,
    deadlineTs: 0,
    minPerSide: 2,
    founderCount: 2,
    builderCount: 2,
    rankingCount: 0,
    sealedCount: 0,
    tick: 0,
    pairs: new Array(16).fill(NONE),
    status: "settled",
    transparent: false,
    history: [],
    historyLen: 0,
    randomnessFulfilled: true,
    totalProposals: 0,
    settledTs: 0,
    ...over,
  } as RoundAccount;
}

describe("Elección de la ronda para el ticker", () => {
  test("no hay nada que mostrar sin rondas", () => {
    assert.equal(pickTickerRound(null), undefined);
    assert.equal(pickTickerRound([]), undefined);
  });

  test("ignora rondas que no cerraron", () => {
    const pairs = [0, 1, ...new Array(14).fill(NONE)];
    assert.equal(pickTickerRound([round({ status: "open", pairs })]), undefined);
    assert.equal(pickTickerRound([round({ status: "matching", pairs })]), undefined);
  });

  test("ignora una ronda cerrada sin ningún par", () => {
    assert.equal(pickTickerRound([round({ status: "settled" })]), undefined);
  });

  test("elige la primera cerrada y con pares", () => {
    const good = round({ roundId: 9n, pairs: [1, 0, ...new Array(14).fill(NONE)] });
    const list = [round({ status: "open" }), round({ status: "settled" }), good];
    assert.equal(pickTickerRound(list)?.roundId, 9n);
  });

  test("un solo par ya basta", () => {
    const one = round({ pairs: [3, ...new Array(15).fill(NONE)] });
    assert.equal(pickTickerRound([one]), one);
  });

  test("respeta el orden recibido (la lista viene ordenada por id desc)", () => {
    const nueva = round({ roundId: 20n, pairs: [0, ...new Array(15).fill(NONE)] });
    const vieja = round({ roundId: 2n, pairs: [1, ...new Array(15).fill(NONE)] });
    assert.equal(pickTickerRound([nueva, vieja])?.roundId, 20n);
  });
});
