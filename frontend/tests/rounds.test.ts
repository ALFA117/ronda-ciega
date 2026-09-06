import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import { NONE } from "../lib/constants.ts";
import { byInterest, interest, pickTickerRound } from "../lib/rounds.ts";
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

describe("Orden de la lista de rondas", () => {
  const paired = [0, 1, ...new Array(14).fill(NONE)];

  test("las rondas con resultado van primero", () => {
    const vacia = round({ roundId: 99n, status: "open" });
    const conResultado = round({ roundId: 1n, status: "settled", pairs: paired });
    const ordenadas = [vacia, conResultado].sort(byInterest);
    assert.equal(ordenadas[0].roundId, 1n, "la ronda vacía más nueva no debe encabezar");
  });

  test("una ronda en curso va antes que una vacía", () => {
    const vacia = round({ roundId: 99n, status: "open", founderCount: 1, builderCount: 0 });
    const enCurso = round({
      roundId: 50n,
      status: "open",
      founderCount: 3,
      builderCount: 3,
      rankingCount: 2,
    });
    assert.equal([vacia, enCurso].sort(byInterest)[0].roundId, 50n);
  });

  test("dentro del mismo grupo manda la más reciente", () => {
    const vieja = round({ roundId: 2n, status: "settled", pairs: paired });
    const nueva = round({ roundId: 80n, status: "settled", pairs: paired });
    assert.equal([vieja, nueva].sort(byInterest)[0].roundId, 80n);
  });

  test("cerrada sin ningún par no alcanza el nivel de 'con resultado'", () => {
    // Settled but everyone unmatched: there is nothing to look at, so it must
    // not outrank a round that did pair people — even a much older one.
    const sinPares = round({ roundId: 70n, status: "settled" });
    const conPares = round({ roundId: 3n, status: "settled", pairs: paired });
    assert.equal([sinPares, conPares].sort(byInterest)[0].roundId, 3n);
  });

  test("el orden es estable y total (no depende del orden de entrada)", () => {
    const rs = [
      round({ roundId: 5n, status: "open" }),
      round({ roundId: 9n, status: "settled", pairs: paired }),
      round({ roundId: 7n, status: "open", rankingCount: 3 }),
    ];
    const a = [...rs].sort(byInterest).map((r) => r.roundId);
    const b = [...rs].reverse().sort(byInterest).map((r) => r.roundId);
    assert.deepEqual(a, b);
    assert.deepEqual(a, [9n, 7n, 5n]);
  });
});

describe("Dentro del mismo grupo manda el tamaño", () => {
  const paired = [0, 1, ...new Array(14).fill(NONE)];

  test("una ronda grande va antes que una chica más nueva", () => {
    const chicaNueva = round({
      roundId: 900n, status: "settled", pairs: paired,
      founderCount: 2, builderCount: 2,
    });
    const grandeVieja = round({
      roundId: 4n, status: "settled", pairs: paired,
      founderCount: 6, builderCount: 6,
    });
    assert.equal([chicaNueva, grandeVieja].sort(byInterest)[0].roundId, 4n);
  });

  test("a igual tamaño manda la más reciente", () => {
    const a = round({ roundId: 5n, status: "settled", pairs: paired });
    const b = round({ roundId: 60n, status: "settled", pairs: paired });
    assert.equal([a, b].sort(byInterest)[0].roundId, 60n);
  });

  test("el tamaño nunca supera al grupo", () => {
    // A huge round with nothing in it still loses to a small finished one.
    const grandeVacia = round({
      roundId: 900n, status: "open", founderCount: 8, builderCount: 8,
      rankingCount: 0,
    });
    const chicaLista = round({
      roundId: 2n, status: "settled", pairs: paired,
      founderCount: 2, builderCount: 2,
    });
    assert.equal([grandeVacia, chicaLista].sort(byInterest)[0].roundId, 2n);
  });
});

describe("Qué cuenta como ronda en curso", () => {
  test("una ronda que no puede cerrar no está en curso", () => {
    // 1 founder and 16 builders is seventeen people and a round that can never
    // settle: the minimum is per side, not a total.
    const imposible = round({
      roundId: 900n, status: "open",
      founderCount: 1, builderCount: 16, minPerSide: 2, rankingCount: 0,
    });
    assert.equal(interest(imposible), 0);
  });

  test("ambos lados en el mínimo sí está en curso", () => {
    const viable = round({
      status: "open", founderCount: 2, builderCount: 2, minPerSide: 2, rankingCount: 0,
    });
    assert.equal(interest(viable), 1);
  });

  test("con listas selladas cuenta aunque falte gente", () => {
    const conListas = round({
      status: "open", founderCount: 1, builderCount: 1, minPerSide: 2, rankingCount: 2,
    });
    assert.equal(interest(conListas), 1);
  });

  test("una ronda cerrada con pares sigue siendo la de mayor interés", () => {
    const settled = round({
      status: "settled", pairs: [0, 1, ...new Array(14).fill(NONE)],
    });
    assert.equal(interest(settled), 2);
  });
});
