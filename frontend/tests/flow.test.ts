import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  enclaveSpan,
  firstUnanswered,
  FLOW,
  progress,
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
});

describe("La región del enclave", () => {
  test("cubre exactamente el tramo de adentro", () => {
    assert.deepEqual(enclaveSpan(), { from: 2, to: 3 });
  });

  test("se calcula, no se escribe: mover el tramo mueve la banda", () => {
    const otro = [
      { id: "open", where: "l1" },
      { id: "seal", where: "enclave" },
      { id: "match", where: "enclave" },
      { id: "result", where: "enclave" },
    ] as const;
    assert.deepEqual(enclaveSpan(otro), { from: 1, to: 3 });
  });

  test("sin nada adentro no hay banda que dibujar", () => {
    assert.equal(enclaveSpan([{ id: "open", where: "l1" }] as const), null);
  });

  test("solo toma el primer tramo, que es el que la banda puede pintar", () => {
    const partido = [
      { id: "seal", where: "enclave" },
      { id: "join", where: "l1" },
      { id: "match", where: "enclave" },
    ] as const;
    assert.deepEqual(enclaveSpan(partido), { from: 0, to: 0 });
  });
});

describe("El avance del riel", () => {
  test("va de 0 a 1 y no se sale", () => {
    assert.equal(progress(0, 3), 0);
    assert.equal(progress(3, 3), 1);
    assert.equal(progress(9, 3), 1);
    assert.equal(progress(-2, 3), 0);
  });

  test("un riel sin pasos no avanza en vez de dividir entre cero", () => {
    assert.equal(progress(1, 0), 0);
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
