import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  readValidUntil,
  sessionState,
  sessionTokenPda,
  SESSION_PROGRAM,
} from "../lib/session.ts";
import { PROGRAM_ID } from "../lib/constants.ts";

const wallet = Keypair.generate().publicKey;

/** A SessionToken as the session-keys program lays one out. */
function token(validUntil: number, len = 112): Uint8Array {
  const data = new Uint8Array(len);
  const view = new DataView(data.buffer);
  if (len >= 112) view.setBigInt64(8 + 32 * 3, BigInt(validUntil), true);
  return data;
}

function rpc(account: Uint8Array | null) {
  return {
    async getAccountInfo() {
      return account === null ? null : { data: account };
    },
  };
}

const NOW = 1_800_000_000;

describe("El token de sesión, leído de la cadena", () => {
  test("lee valid_until del final del registro", () => {
    assert.equal(readValidUntil(token(NOW + 60)), NOW + 60);
  });

  test("un registro de otro tamaño no es un token", () => {
    assert.equal(readValidUntil(token(NOW, 80)), null);
    assert.equal(readValidUntil(new Uint8Array(0)), null);
  });

  test("lee correctamente aunque el búfer venga con offset", () => {
    // Lo que devuelve web3.js es un Buffer, que muy a menudo es una vista
    // sobre un ArrayBuffer más grande. Leer con `data.buffer` a secas y sin
    // `byteOffset` da el valor equivocado exactamente en ese caso.
    const big = new Uint8Array(200);
    big.set(token(NOW + 900), 44);
    const view = big.subarray(44, 44 + 112);
    assert.equal(readValidUntil(view), NOW + 900);
  });
});

describe("Cuántas firmas cuesta lo siguiente", () => {
  test("sin cuenta en L1, no hay sesión", async () => {
    assert.equal(await sessionState(rpc(null), wallet, NOW), "none");
  });

  test("un token vigente es una sesión viva", async () => {
    assert.equal(await sessionState(rpc(token(NOW + 3600)), wallet, NOW), "live");
  });

  test("un token vencido sigue existiendo, y ya no sirve", async () => {
    // El caso que motivó todo esto: la cuenta se queda ahí para siempre, así
    // que preguntar sólo si existe le promete "gratis" justo a quien vuelve
    // al día siguiente.
    assert.equal(await sessionState(rpc(token(NOW - 1)), wallet, NOW), "expired");
  });

  test("justo en el segundo del vencimiento ya no vale", async () => {
    assert.equal(await sessionState(rpc(token(NOW)), wallet, NOW), "expired");
  });

  test("una cuenta con otra forma se cobra, no se regala", async () => {
    assert.equal(await sessionState(rpc(token(NOW + 3600, 80)), wallet, NOW), "expired");
  });

  test("un RPC que no contesta no es evidencia de nada", async () => {
    const dead = {
      async getAccountInfo(): Promise<{ data: Uint8Array } | null> {
        throw new Error("503");
      },
    };
    assert.equal(await sessionState(dead, wallet, NOW), "none");
  });
});

describe("La dirección del token", () => {
  test("la deriva el programa de sesiones, no el nuestro", () => {
    const signer = Keypair.generate().publicKey;
    const pda = sessionTokenPda(signer, wallet);
    const expected = PublicKey.findProgramAddressSync(
      [
        Buffer.from("session_token"),
        PROGRAM_ID.toBuffer(),
        signer.toBuffer(),
        wallet.toBuffer(),
      ],
      SESSION_PROGRAM,
    )[0];
    assert.ok(pda.equals(expected));
  });

  test("cada dueño tiene la suya, aunque firme la misma clave", () => {
    const signer = Keypair.generate().publicKey;
    const otro = Keypair.generate().publicKey;
    assert.ok(!sessionTokenPda(signer, wallet).equals(sessionTokenPda(signer, otro)));
  });
});
