import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyError } from "../lib/errors.ts";

describe("Clasificación de errores de billetera", () => {
  test("el rechazo del usuario no es una falla del sistema", () => {
    assert.equal(classifyError(new Error("User rejected the request.")), "rejected");
    assert.equal(classifyError({ message: "User denied transaction signature" }), "rejected");
    assert.equal(
      classifyError({ name: "WalletSignTransactionError", message: "" }),
      "rejected",
    );
  });

  test("la simulación revertida es una wallet en la red equivocada", () => {
    // The exact pair of strings a wallet on mainnet shows for a devnet program.
    assert.equal(
      classifyError(new Error("This transaction was reverted during simulation")),
      "wrongNetwork",
    );
    assert.equal(classifyError(new Error("An unknown error occurred.")), "wrongNetwork");
    assert.equal(
      classifyError({ message: "Attempt to load a program that does not exist" }),
      "wrongNetwork",
    );
  });

  test("falta de saldo se distingue de red equivocada", () => {
    assert.equal(
      classifyError(new Error("Transfer: insufficient lamports 890880, need 1224960")),
      "lowBalance",
    );
    assert.equal(classifyError(new Error("Insufficient funds")), "lowBalance");
  });

  test("un blockhash vencido es propio, y se reintenta", () => {
    assert.equal(classifyError(new Error("Blockhash not found")), "blockhash");
    assert.equal(
      classifyError(new Error("block height exceeded")),
      "blockhash",
    );
  });

  test("lo que no reconoce no lo inventa", () => {
    assert.equal(classifyError(new Error("something else entirely")), "unknown");
    assert.equal(classifyError(null), "unknown");
    assert.equal(classifyError(undefined), "unknown");
    assert.equal(classifyError({}), "unknown");
  });

  test("el rechazo gana sobre otras señales en el mismo mensaje", () => {
    // Wallets often append their own context to a rejection.
    assert.equal(
      classifyError(
        new Error("User rejected the request. Transaction was reverted during simulation"),
      ),
      "rejected",
    );
  });

  test("lee el mensaje anidado que usan los adaptadores", () => {
    assert.equal(
      classifyError({ error: { message: "insufficient lamports" } }),
      "lowBalance",
    );
  });
});

describe("Errores del programa, sin logs del TEE", () => {
  test("reconoce el código numérico cuando el mensaje viene vacío", () => {
    // What a rollup failure actually looks like: no logs, empty message, the
    // program error number buried somewhere in the object.
    assert.equal(classifyError({ message: "", code: 6001 }), "roundClosed");
    assert.equal(classifyError({ message: "", code: 6009 }), "alreadyDone");
    assert.equal(classifyError({ message: "", code: 6016 }), "noRandomness");
  });

  test("reconoce el código en hexadecimal, como lo imprime Solana", () => {
    assert.equal(
      classifyError(new Error("custom program error: 0x1771")), // 6001
      "roundClosed",
    );
    assert.equal(
      classifyError(new Error("custom program error: 0x1776")), // 6006
      "badRanking",
    );
  });

  test("reconoce el nombre cuando los logs sí llegaron", () => {
    assert.equal(
      classifyError({ error: { errorCode: { code: "SideFull" } } }),
      "sideFull",
    );
    assert.equal(
      classifyError({ message: "Error: WrongRoundStatus" }),
      "roundClosed",
    );
  });

  test("un rechazo del usuario gana sobre cualquier código de programa", () => {
    assert.equal(
      classifyError({ message: "User rejected the request.", code: 6001 }),
      "rejected",
    );
  });

  test("no confunde un número cualquiera con un código de programa", () => {
    assert.equal(classifyError(new Error("took 6001 milliseconds")), "unknown");
    assert.equal(classifyError(new Error("value 42 out of range")), "unknown");
  });
});

describe("Los códigos del programa que faltaban", () => {
  // Ten of the program's nineteen codes were mapped and the other nine fell
  // through to "unknown" — which reads as "The operation could not be
  // completed" for a failure the program explained precisely. Two of the nine
  // are the ones a real person actually hits.

  test("6000 es una fecha límite ya pasada, no un error desconocido", () => {
    // The reported symptom: creating a round with an empty "closes in" box
    // sent a deadline of now, the program refused it, and the page said the
    // round could not be created without saying why.
    assert.equal(
      classifyError({ message: "custom program error: 0x1770" }),
      "deadlinePast",
    );
    assert.equal(classifyError({ message: "Error Code: DeadlineInPast" }), "deadlinePast");
  });

  test("6011 es un perfil que no cabe", () => {
    // The program measures bytes; the input counted characters. An accented
    // handle passed the box and was refused on chain.
    assert.equal(
      classifyError({ message: "custom program error: 0x177b" }),
      "profileTooLong",
    );
    assert.equal(
      classifyError({ message: "Error Code: ProfileTooLong" }),
      "profileTooLong",
    );
  });

  test("los códigos del operador ya no son 'desconocido'", () => {
    assert.equal(classifyError({ message: "custom program error: 0x1778" }), "wrongRound");
    assert.equal(
      classifyError({ message: "custom program error: 0x177a" }),
      "sealIncomplete",
    );
    assert.equal(
      classifyError({ message: "custom program error: 0x177e" }),
      "badPreferences",
    );
    assert.equal(
      classifyError({ message: "custom program error: 0x177f" }),
      "randomnessDone",
    );
    assert.equal(
      classifyError({ message: "custom program error: 0x1781" }),
      "badTickBudget",
    );
    assert.equal(classifyError({ message: "custom program error: 0x1782" }), "overflow");
  });

  test("6012 es una clave de sesión inválida", () => {
    assert.equal(classifyError({ message: "custom program error: 0x177c" }), "badSession");
  });

  test("los diecinueve códigos están cubiertos", () => {
    // The point of this one is arithmetic, not any single mapping: every code
    // the program can raise now has something to say.
    const unmapped = [];
    for (let code = 6000; code <= 6018; code++) {
      const hex = "0x" + code.toString(16);
      if (classifyError({ message: "custom program error: " + hex }) === "unknown") {
        unmapped.push(code);
      }
    }
    assert.deepEqual(unmapped, []);
  });

  test("un número suelto que se parece a un código sigue sin contar", () => {
    // 6000 in a handle, a balance or a slot height must not be read as an
    // error code. Only a number sitting beside code= or "custom program
    // error:" counts.
    assert.equal(classifyError({ message: "balance is 6011 lamports" }), "unknown");
  });
});
