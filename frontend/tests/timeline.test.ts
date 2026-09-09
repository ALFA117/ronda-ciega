import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  firstInstructionTime,
  humanGap,
  MILESTONES,
  timeline,
} from "../lib/timeline.ts";

const NOW = 1_800_000_000;

/** A round that ran its whole life in four minutes. */
const complete = {
  openedAt: NOW - 240,
  roundId: BigInt((NOW - 241) * 1000),
  deadlineTs: NOW - 120,
  settledTs: NOW - 118,
  paidAt: NOW - 95,
  now: NOW,
};

describe("La línea de tiempo de una ronda", () => {
  test("siempre son los cuatro hitos, en orden", () => {
    // La forma del proceso no cambia según qué tan avanzada esté la ronda.
    // Esconder los que faltan haría que una ronda abierta y una liquidada
    // parecieran cosas distintas.
    const t = timeline({ deadlineTs: 0, settledTs: 0, now: NOW });
    assert.deepEqual(t.map((m) => m.id), MILESTONES);
    assert.equal(t.length, 4);
  });

  test("mide los tramos entre hitos consecutivos", () => {
    const t = timeline(complete);
    assert.equal(t[1].since, 120); // abierta → cerrada
    assert.equal(t[2].since, 2); //   cerrada → emparejada
    assert.equal(t[3].since, 23); //  emparejada → pagada
  });

  test("el primer hito no tiene tramo anterior", () => {
    assert.equal(timeline(complete)[0].since, null);
  });
});

describe("De dónde salió cada hora", () => {
  test("el tiempo de bloque manda sobre el round_id", () => {
    const t = timeline(complete);
    assert.equal(t[0].at, NOW - 240);
    assert.equal(t[0].source, "chain");
  });

  test("sin tiempo de bloque, el round_id se ofrece como lo que es", () => {
    // Quien abrió la ronda eligió ese número. Mostrarlo como observado sería
    // presentar una afirmación como un hecho.
    const t = timeline({ ...complete, openedAt: null });
    assert.equal(t[0].at, NOW - 241);
    assert.equal(t[0].source, "claimed");
  });

  test("un round_id que no es una fecha no se cuela como fecha", () => {
    for (const id of [0n, 1n, 42n, BigInt(Number.MAX_SAFE_INTEGER)]) {
      const t = timeline({ ...complete, openedAt: null, roundId: id });
      assert.equal(t[0].at, null, `round_id ${id} pasó por fecha`);
      assert.equal(t[0].source, "unknown");
    }
  });

  test("una fecha límite futura es una cita, no un hecho", () => {
    const t = timeline({ ...complete, deadlineTs: NOW + 600, settledTs: 0, paidAt: null });
    assert.equal(t[1].source, "scheduled");
  });

  test("una fecha límite pasada sí ocurrió", () => {
    assert.equal(timeline(complete)[1].source, "chain");
  });
});

describe("Lo que todavía no pasa", () => {
  test("una ronda abierta no inventa liquidación ni pago", () => {
    const t = timeline({
      openedAt: NOW - 60,
      deadlineTs: NOW + 600,
      settledTs: 0,
      now: NOW,
    });
    assert.equal(t[2].at, null);
    assert.equal(t[3].at, null);
    assert.equal(t[2].since, null);
  });

  test("un cero no se convierte en 1970", () => {
    // El bug que esta función existe para no repetir: restar contra un cero
    // da un tramo de cincuenta y seis años, y este proyecto ya publicó una
    // ronda fechada en 1970 una vez.
    const t = timeline({ openedAt: NOW - 60, deadlineTs: NOW - 30, settledTs: 0, now: NOW });
    assert.equal(t[2].since, null);
    assert.ok(t.every((m) => m.since === null || m.since < 86_400 * 365));
  });

  test("un hito fuera de orden no produce un tramo negativo", () => {
    // Los relojes de la cadena no siempre suben de forma monótona entre
    // cuentas distintas, y un tramo negativo en pantalla es peor que ninguno.
    const t = timeline({ ...complete, settledTs: complete.deadlineTs - 5 });
    assert.equal(t[2].since, null);
  });
});

describe("Duraciones legibles", () => {
  test("por debajo del segundo se dice así, no se redondea a uno", () => {
    // El emparejamiento converge dentro de una sola transacción. Redondear
    // eso hacia arriba borraría la única cifra que defiende el rollup.
    assert.equal(humanGap(0), "<1 s");
    assert.equal(humanGap(0.4), "<1 s");
  });

  test("sube de unidad cuando la anterior deja de leerse", () => {
    assert.equal(humanGap(45), "45 s");
    assert.equal(humanGap(120), "2 min");
    assert.equal(humanGap(7200), "2 h");
    assert.equal(humanGap(200_000), "2 d");
  });
});

describe("Encontrar el pago en los logs", () => {
  const tx = (blockTime: number | null, ...logs: string[]) => ({ blockTime, logs });

  test("encuentra la transacción que ejecutó la instrucción", () => {
    const t = firstInstructionTime(
      [
        tx(500, "Program log: Instruction: RefundEscrow"),
        tx(420, "Program log: Instruction: SettlePair", "Program log: ok"),
        tx(300, "Program log: Instruction: Tick"),
      ],
      "SettlePair",
    );
    assert.equal(t, 420);
  });

  test("toma la primera, no la última, aunque lleguen al revés", () => {
    // El RPC devuelve de más nueva a más vieja. Confiar en el orden en vez de
    // ordenar es cómo un reembolso posterior se convierte en "el pago".
    const t = firstInstructionTime(
      [tx(900, "Program log: Instruction: SettlePair"), tx(420, "Program log: Instruction: SettlePair")],
      "SettlePair",
    );
    assert.equal(t, 420);
  });

  test("sin esa instrucción, no inventa una hora", () => {
    assert.equal(
      firstInstructionTime([tx(500, "Program log: Instruction: Tick")], "SettlePair"),
      null,
    );
  });

  test("una transacción sin logs o sin hora no cuenta", () => {
    assert.equal(firstInstructionTime([{ blockTime: 500 }], "SettlePair"), null);
    assert.equal(
      firstInstructionTime([tx(null, "Program log: Instruction: SettlePair")], "SettlePair"),
      null,
    );
    assert.equal(firstInstructionTime([], "SettlePair"), null);
  });

  test("no confunde una instrucción con otra que la contiene", () => {
    assert.equal(
      firstInstructionTime([tx(500, "Program log: Instruction: SettlePairAndClose")], "SettlePair"),
      500,
    );
  });
});
