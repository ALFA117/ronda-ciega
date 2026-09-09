import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NONE } from "../lib/constants.ts";
import { currentStep, isBystander, partnerIndex } from "../lib/steps.ts";

// A round with people on both sides, so oppositeCount never becomes the
// reason a case takes a branch it was not written to test.
const open = {
  open: true,
  connected: true,
  joined: true,
  delegated: true,
  oppositeCount: 4,
  // Funded, so the cases below reach the step they were written to test.
  // Leaving it out sent every one of them to "fund", which is the machine
  // working: money comes before lists, and the chain refuses the other order.
  funded: true,
};

describe("currentStep", () => {
  test("a visitor with no wallet is asked to connect, whatever else is true", () => {
    for (const o of [true, false]) {
      for (const d of [true, false]) {
        assert.equal(
          currentStep({
            open: o,
            connected: false,
            joined: false,
            delegated: d,
            oppositeCount: 4,
          }),
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
      currentStep({
        open: false,
        connected: true,
        joined: false,
        delegated: true,
        oppositeCount: 4,
      }),
      "result",
    );
  });
});

describe("currentStep, con dinero de por medio", () => {
  test("entrar no basta: primero se bloquea lo que ofreces", () => {
    assert.equal(currentStep({ ...open, funded: false }), "fund");
  });

  test("sin decir nada, se asume que no hay depósito", () => {
    const { funded, ...sinDecir } = open;
    void funded;
    assert.equal(currentStep(sinDecir), "fund");
  });

  test("el depósito va antes que la lista, como en el programa", () => {
    // El programa rechaza un depósito después del sellado, así que ofrecerlo
    // en ese orden sería ofrecer una transacción que la cadena va a tumbar.
    assert.equal(currentStep({ ...open, funded: false, delegated: true }), "fund");
    assert.equal(currentStep({ ...open, funded: true, delegated: true }), "rank");
  });

  test("sin entrar a la ronda no se pide depósito, se pide entrar", () => {
    assert.equal(currentStep({ ...open, joined: false, funded: false }), "join");
  });

  test("una ronda cerrada no pide dinero, muestra el resultado", () => {
    assert.equal(currentStep({ ...open, open: false, funded: false }), "result");
  });

  test("sin monedero no se pide depósito", () => {
    assert.equal(
      currentStep({ ...open, connected: false, funded: false }),
      "connect",
    );
  });
});

describe("currentStep, después de sellar", () => {
  test("sellar mueve el paso, y no sellar lo deja donde estaba", () => {
    assert.equal(currentStep({ ...open, sealed: true }), "sealed");
    assert.equal(currentStep({ ...open, sealed: false }), "rank");
  });

  test("sin decir nada, se asume que no", () => {
    // El campo es opcional a propósito: una lista sellada vive detrás de un
    // permiso que nombra a su dueño, así que preguntarle a la cadena si
    // existe le costaría una firma. Lo que no se sabe se dibuja como "aún
    // no", que es el lado en el que equivocarse no promete nada.
    assert.equal(currentStep(open), "rank");
  });

  test("haber sellado no adelanta una ronda que ni siquiera está en el rollup", () => {
    assert.equal(currentStep({ ...open, delegated: false, sealed: true }), "wait");
  });

  test("haber sellado no te saca de estar solo de tu lado", () => {
    // Sellar con la otra parte vacía no es un estado que se pueda alcanzar,
    // y si lo fuera, "sellada" taparía el aviso que explica el atasco.
    assert.equal(currentStep({ ...open, oppositeCount: 0, sealed: true }), "alone");
  });

  test("al cerrar la ronda, sellada o no, lo que toca es el resultado", () => {
    assert.equal(currentStep({ ...open, open: false, sealed: true }), "result");
  });

  test("un visitante sin monedero no puede haber sellado nada", () => {
    assert.equal(currentStep({ ...open, connected: false, sealed: true }), "connect");
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

describe("solo de un lado", () => {
  // Reported from a real round: somebody opened one, joined as the only
  // builder, and the panel put them on "seal a list" with a form that said
  // there was nobody to rank and a button that could not be pressed. Every
  // sentence was true and none of them said what had gone wrong.
  const joined = {
    open: true,
    connected: true,
    joined: true,
    delegated: true,
    funded: true,
  };

  test("joined and delegated with an empty opposite side is not ranking", () => {
    assert.equal(currentStep({ ...joined, oppositeCount: 0 }), "alone");
  });

  test("one person on the other side is enough to start", () => {
    // The round still cannot close — quorum is two per side — but a list can
    // be written, and telling someone they are alone when they are not is its
    // own kind of wrong.
    assert.equal(currentStep({ ...joined, oppositeCount: 1 }), "rank");
  });

  test("y el depósito se pide antes de descubrir que estás solo", () => {
    // Discutible, y sale de lo que la cadena acepta: se puede depositar en
    // cuanto entras, y no se puede sellar lista hasta que haya alguien
    // enfrente. Poner "estás solo" primero dejaría a alguien esperando a
    // gente antes de hacer lo único que sí puede hacer ya.
    assert.equal(
      currentStep({ ...joined, funded: false, oppositeCount: 0 }),
      "fund",
    );
  });

  test("being alone does not outrank the reasons that come before it", () => {
    // A round that has not reached the rollup cannot hold a ranking either,
    // and that is the more useful thing to say first.
    assert.equal(
      currentStep({ ...joined, delegated: false, oppositeCount: 0 }),
      "wait",
    );
    // And a closed round reports its result, however empty the sides were.
    assert.equal(
      currentStep({ ...joined, open: false, oppositeCount: 0 }),
      "result",
    );
  });

  test("someone who has not joined is never alone, they are joining", () => {
    assert.equal(
      currentStep({ ...joined, joined: false, oppositeCount: 0 }),
      "join",
    );
  });
});
