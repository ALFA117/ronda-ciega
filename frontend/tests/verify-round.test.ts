import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NONE } from "../lib/constants.ts";
import { verifyRound } from "../lib/verify-round.ts";

const pad = (a: number[]) => [...a, ...new Array(16 - a.length).fill(NONE)];
const ok = (id: string, r: ReturnType<typeof verifyRound>) =>
  r.checks.find((c) => c.id === id)!.ok;

describe("Verificación de una ronda transparente", () => {
  test("una traza real pasa las cuatro comprobaciones", () => {
    const frames = [pad([0, NONE, NONE]), pad([0, 1, NONE]), pad([0, 1, 2])];
    const r = verifyRound({
      frames,
      pairs: pad([0, 1, 2]),
      founderCount: 3,
      builderCount: 3,
    });
    assert.equal(r.allPassed, true, JSON.stringify(r.checks));
  });

  test("detecta un builder tomado por dos founders", () => {
    const frames = [pad([0, 0, NONE])];
    const r = verifyRound({
      frames,
      pairs: pad([0, 0, NONE]),
      founderCount: 3,
      builderCount: 3,
    });
    assert.equal(ok("injective", r), false);
    assert.equal(r.allPassed, false);
  });

  test("detecta un índice que no existe en la ronda", () => {
    const r = verifyRound({
      frames: [pad([9, NONE])],
      pairs: pad([9, NONE]),
      founderCount: 2,
      builderCount: 2,
    });
    assert.equal(ok("inRange", r), false);
  });

  test("detecta que el número de emparejados retroceda", () => {
    // Gale–Shapley swaps a holder or fills an empty slot; it never unpairs
    // somebody without pairing another in the same step.
    const frames = [pad([0, 1]), pad([0, NONE])];
    const r = verifyRound({
      frames,
      pairs: pad([0, NONE]),
      founderCount: 2,
      builderCount: 2,
    });
    assert.equal(ok("monotone", r), false);
    assert.match(r.checks.find((c) => c.id === "monotone")!.detail, /2 → 1/);
  });

  test("un intercambio mantiene la cuenta y sigue siendo válido", () => {
    // Builder 0 drops founder 0 for founder 1; founder 0 then takes builder 1.
    const frames = [pad([0, NONE]), pad([NONE, 0]), pad([1, 0])];
    const r = verifyRound({
      frames,
      pairs: pad([1, 0]),
      founderCount: 2,
      builderCount: 2,
    });
    assert.equal(ok("monotone", r), true, "1 → 1 → 2 no retrocede");
    assert.equal(r.allPassed, true);
  });

  test("detecta que la traza termine en otro lado que la cadena", () => {
    const r = verifyRound({
      frames: [pad([0, 1])],
      pairs: pad([1, 0]),
      founderCount: 2,
      builderCount: 2,
    });
    assert.equal(ok("matchesChain", r), false);
  });

  test("una ronda sin traza no aprueba por omisión", () => {
    const r = verifyRound({
      frames: [],
      pairs: pad([0, 1]),
      founderCount: 2,
      builderCount: 2,
    });
    assert.equal(ok("matchesChain", r), false, "sin frames no hay nada que cuadre");
  });

  test("ignora las posiciones más allá de los founders reales", () => {
    // The array is always 16 long; only the first `founderCount` entries mean
    // anything, and stale bytes past that must not fail the round.
    const frames = [pad([0, 1]).map((v, i) => (i >= 2 ? 3 : v))];
    const r = verifyRound({
      frames,
      pairs: pad([0, 1]).map((v, i) => (i >= 2 ? 3 : v)),
      founderCount: 2,
      builderCount: 2,
    });
    assert.equal(r.allPassed, true);
  });
});
