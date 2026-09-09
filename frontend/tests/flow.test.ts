import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  enclaveSpan,
  firstUnanswered,
  FLOW,
  stepState,
} from "../lib/flow.ts";

describe("La secuencia que dibuja la página", () => {
  test("empieza y termina en L1, y pasa por el enclave", () => {
    assert.equal(FLOW[0].where, "l1");
    assert.equal(FLOW[FLOW.length - 1].where, "l1");
    assert.ok(FLOW.some((s) => s.where === "enclave"));
  });

  test("los pasos del enclave son contiguos", () => {
    // El dibujo pinta UNA región, no una insignia por paso. Dos tramos
    // separados se dibujarían como uno solo y la figura mentiría.
    const inside = FLOW.map((s, i) => (s.where === "enclave" ? i : -1)).filter(
      (i) => i >= 0,
    );
    const contiguous = inside.every((v, k) => k === 0 || v === inside[k - 1] + 1);
    assert.ok(contiguous, "los pasos dentro del enclave no son contiguos");
  });

  test("ningún identificador se repite", () => {
    assert.equal(new Set(FLOW.map((s) => s.id)).size, FLOW.length);
  });

  test("el dinero entra y sale por L1, nunca por el enclave", () => {
    // La afirmación entera del proyecto, como propiedad de los datos: los
    // pasos con fondos de por medio están los dos fuera del recinto. Meter
    // uno adentro pondría la custodia detrás de la misma frontera de
    // confianza en la que se apoya el argumento de privacidad.
    for (const step of FLOW.filter((s) => s.tone !== "neutral")) {
      assert.equal(step.where, "l1", `${step.id} mueve dinero dentro del enclave`);
    }
  });

  test("hay exactamente un paso que bloquea y uno que paga", () => {
    assert.equal(FLOW.filter((s) => s.tone === "escrow").length, 1);
    assert.equal(FLOW.filter((s) => s.tone === "settled").length, 1);
  });

  test("primero se bloquea y después se paga", () => {
    const lock = FLOW.findIndex((s) => s.tone === "escrow");
    const pay = FLOW.findIndex((s) => s.tone === "settled");
    assert.ok(lock < pay, "el pago no puede ir antes que el depósito");
  });
});

describe("La región del enclave", () => {
  test("cubre exactamente el tramo de adentro", () => {
    assert.deepEqual(enclaveSpan(), { from: 3, to: 4 });
  });

  test("se calcula, no se escribe: mover el tramo mueve la banda", () => {
    const otro = [
      { id: "open", where: "l1", tone: "neutral" },
      { id: "seal", where: "enclave", tone: "neutral" },
      { id: "match", where: "enclave", tone: "neutral" },
      { id: "result", where: "enclave", tone: "neutral" },
    ] as const;
    assert.deepEqual(enclaveSpan(otro), { from: 1, to: 3 });
  });

  test("sin nada adentro no hay banda que dibujar", () => {
    assert.equal(
      enclaveSpan([{ id: "open", where: "l1", tone: "neutral" }] as const),
      null,
    );
  });

  test("solo toma el primer tramo, que es el que la banda puede pintar", () => {
    const partido = [
      { id: "seal", where: "enclave", tone: "neutral" },
      { id: "join", where: "l1", tone: "neutral" },
      { id: "match", where: "enclave", tone: "neutral" },
    ] as const;
    assert.deepEqual(enclaveSpan(partido), { from: 0, to: 0 });
  });
});

describe("En qué estado se dibuja cada paso", () => {
  test("contestado es contestado, aunque no sea el actual", () => {
    assert.equal(stepState(0, 2, [0, 1]), "done");
    assert.equal(stepState(2, 2, [0, 1]), "active");
    assert.equal(stepState(3, 2, [0, 1]), "ahead");
  });

  test("volver atrás a cambiar algo no borra lo que ya contestaste", () => {
    // El riel no es un asistente: el paso actual sale de lo que falta, no de
    // un cursor. Un paso contestado sigue contestado aunque el activo esté
    // antes que él.
    assert.equal(stepState(2, 0, [1, 2]), "done");
  });
});

describe("Cuál es el paso en el que estás", () => {
  test("el primero sin contestar", () => {
    assert.equal(firstUnanswered([true, false, false]), 1);
    assert.equal(firstUnanswered([false, false, false]), 0);
  });

  test("todo contestado apunta al último, que es la firma", () => {
    assert.equal(firstUnanswered([true, true, true]), 2);
  });

  test("un hueco atrás manda de vuelta al hueco", () => {
    assert.equal(firstUnanswered([true, false, true]), 1);
  });
});
