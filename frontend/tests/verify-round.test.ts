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

describe("Pasos legales entre cuadros", () => {
  // The four original checks each look at a single frame, or at the trace in
  // aggregate. None of them looks at what happens BETWEEN two frames, so a
  // trace could satisfy all four and still contain a move Gale-Shapley cannot
  // make. Neither invariant below needs a preference list, which is why they
  // can be checked at all.

  const run = (frames: number[][], pairs: number[], nF = 3, nB = 3) =>
    verifyRound({ frames, pairs, founderCount: nF, builderCount: nB });

  test("una traza real pasa", () => {
    const frames = [pad([0, NONE, NONE]), pad([0, 1, NONE]), pad([0, 1, 2])];
    assert.equal(ok("legalSteps", run(frames, pad([0, 1, 2]))), true);
  });

  test("un desplazamiento sí es legal: el que pierde, lo pierde ante alguien", () => {
    // Founder 0 held builder 0 and founder 1 takes it. That is the whole
    // mechanism, and it must not be flagged.
    const frames = [pad([0, NONE, NONE]), pad([NONE, 0, NONE])];
    assert.equal(ok("legalSteps", run(frames, pad([NONE, 0, NONE]))), true);
  });

  test("cambiar de pareja EN UNA RONDA sí es legal aquí", () => {
    // The rule I wrote first said this was impossible, on the reasoning that a
    // founder only proposes while unmatched. True of the abstract algorithm,
    // false of this implementation: a proposal round is one sequential loop,
    // so a founder displaced by somebody with a lower index is unmatched again
    // before the loop reaches them and re-pairs inside the same frame. Two of
    // the three transparent demo rounds do exactly that, which is how the rule
    // got found out.
    const frames = [pad([0, NONE, NONE]), pad([1, 0, NONE])];
    assert.equal(ok("legalSteps", run(frames, pad([1, 0, NONE]))), true);
  });

  test("pero el builder que soltó tiene que estar en manos de alguien", () => {
    // Same shape, except nobody picked up builder 0. That is not a rejection,
    // it is an edited trace.
    const frames = [pad([0, NONE, NONE]), pad([1, NONE, NONE])];
    const r = run(frames, pad([1, NONE, NONE]));
    assert.equal(ok("legalSteps", r), false);
    assert.match(r.checks.find((c) => c.id === "legalSteps")!.detail, /nobody/);
  });

  test("un emparejamiento no puede evaporarse", () => {
    // Losing a builder to nobody is not a rejection: it is an edited trace.
    const frames = [pad([0, 1, NONE]), pad([NONE, 1, NONE])];
    const r = run(frames, pad([NONE, 1, NONE]));
    assert.equal(ok("legalSteps", r), false);
    assert.match(r.checks.find((c) => c.id === "legalSteps")!.detail, /nobody/);
  });

  test("una traza de un solo cuadro no tiene transiciones que juzgar", () => {
    // A private round has exactly this shape, and reporting a failure about
    // transitions it never published would be inventing one.
    assert.equal(ok("legalSteps", run([pad([0, 1, 2])], pad([0, 1, 2]))), true);
  });

  test("y el detalle cuenta transiciones, no cuadros", () => {
    const frames = [pad([0, NONE, NONE]), pad([0, 1, NONE]), pad([0, 1, 2])];
    const detail = run(frames, pad([0, 1, 2])).checks.find(
      (c) => c.id === "legalSteps",
    )!.detail;
    assert.equal(detail, "2 transitions");
  });
});
