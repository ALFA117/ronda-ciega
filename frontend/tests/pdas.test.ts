import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { PROGRAM_ID } from "../lib/constants.ts";
import {
  matchStatePda,
  participantPda,
  preferencesPda,
  roundPda,
} from "../lib/pdas.ts";

const authority = Keypair.generate().publicKey;
const wallet = Keypair.generate().publicKey;
const other = Keypair.generate().publicKey;
const round = roundPda(authority, new BN(1));

describe("Derivación de PDAs", () => {
  test("son deterministas: misma entrada, misma dirección", () => {
    assert.ok(roundPda(authority, new BN(7)).equals(roundPda(authority, new BN(7))));
    assert.ok(participantPda(round, wallet).equals(participantPda(round, wallet)));
    assert.ok(preferencesPda(round, wallet).equals(preferencesPda(round, wallet)));
    assert.ok(matchStatePda(round).equals(matchStatePda(round)));
  });

  test("el id de ronda cambia la dirección", () => {
    assert.ok(!roundPda(authority, new BN(1)).equals(roundPda(authority, new BN(2))));
  });

  test("la autoridad cambia la dirección", () => {
    const a = roundPda(authority, new BN(1));
    const b = roundPda(other, new BN(1));
    assert.ok(!a.equals(b), "dos autoridades no pueden compartir la misma ronda");
  });

  test("cada billetera tiene su propia cuenta de participante y de preferencias", () => {
    assert.ok(!participantPda(round, wallet).equals(participantPda(round, other)));
    assert.ok(!preferencesPda(round, wallet).equals(preferencesPda(round, other)));
  });

  test("participante y preferencias nunca colisionan", () => {
    // Different seeds, same inputs: a collision would let one account be
    // written through the other's instruction.
    assert.ok(!participantPda(round, wallet).equals(preferencesPda(round, wallet)));
  });

  test("todas caen fuera de la curva ed25519", () => {
    for (const pda of [
      round,
      participantPda(round, wallet),
      preferencesPda(round, wallet),
      matchStatePda(round),
    ]) {
      assert.equal(PublicKey.isOnCurve(pda.toBytes()), false, `${pda} tiene clave privada`);
    }
  });

  test("el id de ronda se serializa en 8 bytes little-endian", () => {
    // The Rust side reads `round_id.to_le_bytes()`; a mismatch here derives a
    // different account and every instruction fails with a seeds error.
    const expected = PublicKey.findProgramAddressSync(
      [
        Buffer.from("round"),
        authority.toBuffer(),
        Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]),
      ],
      PROGRAM_ID,
    )[0];
    assert.ok(roundPda(authority, new BN(1)).equals(expected));
  });

  test("un id grande no desborda los 8 bytes", () => {
    const big = new BN("18446744073709551615"); // u64::MAX
    assert.doesNotThrow(() => roundPda(authority, big));
  });
});
