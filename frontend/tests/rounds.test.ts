import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import { NONE } from "../lib/constants.ts";
import { byInterest, interest, mergeRounds, pickTickerRound } from "../lib/rounds.ts";
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

  test("una ronda abierta con gente encabeza, incluso sobre una con resultado", () => {
    // Deliberate, and it is a change: finished rounds led while open ones
    // could not appear on this listing at all — they are delegated, and L1
    // cannot see a delegated account. Now that both chains are asked, the only
    // round a visitor can take part in should not sit under every round that
    // is already over. A settled round is the better demonstration; an open
    // one is the better invitation.
    const abierta = round({
      roundId: 99n,
      status: "open",
      founderCount: 4,
      builderCount: 4,
      rankingCount: 8,
    });
    const conResultado = round({ roundId: 1n, status: "settled", pairs: paired });
    assert.equal([conResultado, abierta].sort(byInterest)[0].roundId, 99n);
  });

  test("una ronda abierta y vacía no encabeza nada", () => {
    // Devnet keeps every stub a test run ever left behind. Being open is not
    // the qualification; being open and going somewhere is.
    const vacia = round({
      roundId: 99n,
      status: "open",
      founderCount: 0,
      builderCount: 0,
    });
    const conResultado = round({ roundId: 1n, status: "settled", pairs: paired });
    assert.equal([vacia, conResultado].sort(byInterest)[0].roundId, 1n);
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
      round({ roundId: 5n, status: "open", founderCount: 0, builderCount: 0 }),
      round({ roundId: 9n, status: "settled", pairs: paired }),
      round({ roundId: 7n, status: "open", rankingCount: 3 }),
    ];
    const a = [...rs].sort(byInterest).map((r) => r.roundId);
    const b = [...rs].reverse().sort(byInterest).map((r) => r.roundId);
    assert.deepEqual(a, b);
    // 7 is open with lists in it, so it leads; 9 finished; 5 is an empty stub.
    assert.deepEqual(a, [7n, 9n, 5n]);
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
    // A huge round that cannot go anywhere still loses to a small finished
    // one. Eight and none is eight people and a round that can never close,
    // so it is tier 0 however big the number looks.
    const grandeVacia = round({
      roundId: 900n, status: "open", founderCount: 8, builderCount: 0,
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
    // Open and viable is the top tier: it is the only kind of round a visitor
    // can take part in, and it could not appear on the listing at all until
    // the rollup was asked for it.
    const viable = round({
      status: "open", founderCount: 2, builderCount: 2, minPerSide: 2, rankingCount: 0,
    });
    assert.equal(interest(viable), 3);
  });

  test("con listas selladas cuenta, pero no encabeza si no puede cerrar", () => {
    // One a side with two sealed lists is going somewhere by the ranking count
    // and can never settle, because the minimum is per side. Worth listing —
    // somebody is in it — and not worth leading with, because joining it does
    // not make it closeable on its own.
    const conListas = round({
      status: "open", founderCount: 1, builderCount: 1, minPerSide: 2, rankingCount: 2,
    });
    assert.equal(interest(conListas), 1);
  });

  test("estar en curso y estar abierta son cosas distintas", () => {
    // The two halves of the top tier, pulled apart. A round past Open that is
    // still going somewhere — sealing, matching — is tier 1: worth listing,
    // not worth leading with, because nobody can join it.
    const sellando = round({
      status: "sealing", founderCount: 4, builderCount: 4, rankingCount: 8,
      pairs: new Array(16).fill(NONE),
    });
    assert.equal(interest(sellando), 1);

    // And open without going anywhere is the bottom, not the top.
    const abiertaVacia = round({
      status: "open", founderCount: 0, builderCount: 0, rankingCount: 0,
    });
    assert.equal(interest(abiertaVacia), 0);
  });

  test("una ronda cerrada con pares sigue siendo la de mayor interés", () => {
    const settled = round({
      status: "settled", pairs: [0, 1, ...new Array(14).fill(NONE)],
    });
    assert.equal(interest(settled), 2);
  });
});

describe("mergeRounds", () => {
  /** A second address, so a case can hold two different rounds. */
  const other = new PublicKey("11111111111111111111111111111112");

  // The bug this exists for: L1 cannot see an open round. Delegation moves the
  // account to the delegation program, so getProgramAccounts filtered by this
  // program's id matches only rounds that have come back — the finished ones.
  // Every round is delegated while it is open, so the front page listed
  // seventeen rounds and not one a visitor could join, with no error anywhere.

  test("a round only the rollup can see is kept", () => {
    const open = round({ status: "open", founderCount: 4, builderCount: 4 });
    const merged = mergeRounds([], [open]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].status, "open");
  });

  test("a round only L1 can see is kept", () => {
    const settled = round({ status: "settled" });
    assert.equal(mergeRounds([settled], []).length, 1);
  });

  test("a round on both chains appears once, not twice", () => {
    const a = round({ status: "open" });
    const b = round({ status: "open" });
    assert.equal(mergeRounds([a], [b]).length, 1);
  });

  test("and the rollup's copy is the one kept", () => {
    // L1 keeps whatever was there when the round was handed over: a snapshot
    // that stopped counting the people still joining. Showing it would tell a
    // visitor a live round is emptier than it is.
    const stale = round({ status: "open", founderCount: 0, builderCount: 0 });
    const live = round({ status: "open", founderCount: 4, builderCount: 4 });
    const merged = mergeRounds([stale], [live]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].founderCount, 4);
  });

  test("the result is sorted, not just concatenated", () => {
    // Distinct addresses, or this only re-tests deduplication. byInterest puts
    // a settled round with pairs above an empty stub, and a merge that
    // appended would leave the rollup's rounds wherever they arrived.
    const empty = round({
      address: other,
      status: "open",
      founderCount: 0,
      builderCount: 0,
    });
    const done = round({
      status: "settled",
      pairs: [1, 0, ...new Array(14).fill(NONE)],
      founderCount: 2,
      builderCount: 2,
    });
    const merged = mergeRounds([empty], [done]);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].status, "settled", "the finished round leads");
  });

  test("two empty listings are an empty listing, not a crash", () => {
    assert.deepEqual(mergeRounds([], []), []);
  });
});
