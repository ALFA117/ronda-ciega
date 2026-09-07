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
