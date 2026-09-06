/**
 * Negative paths: does the program refuse what it is supposed to refuse?
 *
 * `spike.ts` proves the happy path works. Nothing proved that the guards work,
 * and a guard that is never exercised is a guard that might not be wired to
 * anything. Each case here provokes one specific failure and asserts the exact
 * error code — not merely that "it threw", which any typo would also satisfy.
 *
 *   npx ts-node scripts/negative.ts
 */
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const IDL = require("../target/idl/ronda_ciega.json");
const DEVNET = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(IDL.address);
const ROUND_SEED = Buffer.from("round");
const PARTICIPANT_SEED = Buffer.from("participant");
const MATCH_STATE_SEED = Buffer.from("match_state");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function loadAuthority(): Keypair {
  const p = path.join(os.homedir(), ".config", "solana", "id.json");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))),
  );
}

function programFor(connection: Connection, payer: Keypair): anchor.Program {
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(payer),
    { commitment: "confirmed", skipPreflight: false },
  );
  return new anchor.Program(IDL as anchor.Idl, provider);
}

function group(title: string) {
  console.log("\n\x1b[1m" + title + "\x1b[0m");
}

/**
 * Run something that must fail, and assert which error came back.
 *
 * Anchor surfaces the code in different shapes depending on whether the
 * failure came from simulation or from the confirmed transaction, so all of
 * them are searched rather than trusting one field.
 */
async function refuses(
  what: string,
  expected: string,
  run: () => Promise<unknown>,
) {
  try {
    await run();
    failed++;
    failures.push(what + ": se ACEPTO, debia fallar con " + expected);
    console.log("  \x1b[31mFAIL\x1b[0m  " + what + " — se aceptó (esperaba " + expected + ")");
  } catch (e: any) {
    const blob = [
      e?.error?.errorCode?.code,
      e?.message,
      JSON.stringify(e?.logs ?? []),
      String(e),
    ].join(" ");
    if (blob.includes(expected)) {
      passed++;
      console.log("  \x1b[32mok\x1b[0m    " + what + " → " + expected);
    } else {
      failed++;
      const got =
        e?.error?.errorCode?.code ?? String(e?.message ?? e).slice(0, 90);
      failures.push(what + ": esperaba " + expected + ", llegó " + got);
      console.log(
        "  \x1b[31mFAIL\x1b[0m  " + what + " — esperaba " + expected + ", llegó " + got,
      );
    }
  }
}

/** Something that must succeed; a failure here means the fixture is broken. */
async function accepts(what: string, run: () => Promise<unknown>) {
  try {
    await run();
    passed++;
    console.log("  \x1b[32mok\x1b[0m    " + what);
  } catch (e: any) {
    failed++;
    const got =
      e?.error?.errorCode?.code ?? String(e?.message ?? e).slice(0, 120);
    failures.push(what + ": debia aceptarse, fallo con " + got);
    console.log("  \x1b[31mFAIL\x1b[0m  " + what + " — " + got);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function roundPda(authority: PublicKey, id: anchor.BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [ROUND_SEED, authority.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  )[0];
}

function participantPda(round: PublicKey, wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [PARTICIPANT_SEED, round.toBuffer(), wallet.toBuffer()],
    PROGRAM_ID,
  )[0];
}

function matchStatePda(round: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [MATCH_STATE_SEED, round.toBuffer()],
    PROGRAM_ID,
  )[0];
}

/**
 * A funded signer that has not joined anything yet.
 *
 * Devnet airdrops are rate-limited to the point of being unusable inside a
 * test run, so the authority pays instead.
 */
async function freshWallet(
  l1: Connection,
  payer: Keypair,
  lamports = 0.01 * LAMPORTS_PER_SOL,
): Promise<Keypair> {
  const kp = Keypair.generate();
  const tx = new anchor.web3.Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: kp.publicKey,
      lamports,
    }),
  );
  await anchor.web3.sendAndConfirmTransaction(l1, tx, [payer], {
    commitment: "confirmed",
  });
  return kp;
}

async function main() {
  const authority = loadAuthority();
  const l1 = new Connection(DEVNET, "confirmed");
  const program = programFor(l1, authority);

  const balance = await l1.getBalance(authority.publicKey);
  console.log("autoridad " + authority.publicKey.toBase58());
  console.log("saldo     " + (balance / LAMPORTS_PER_SOL).toFixed(3) + " SOL");
  if (balance < 0.3 * LAMPORTS_PER_SOL) {
    console.log("\n\x1b[31mSaldo insuficiente para correr la suite.\x1b[0m");
    process.exit(1);
  }

  // ------------------------------------------------------------------
  group("init_round — validación de parámetros");

  await refuses("fecha límite en el pasado", "DeadlineInPast", async () => {
    const id = new anchor.BN(Date.now());
    return program.methods
      .initRound(id, new anchor.BN(Math.floor(Date.now() / 1000) - 60), 2, true)
      .accounts({
        round: roundPda(authority.publicKey, id),
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  await refuses("mínimo por lado menor a 2", "NotEnoughParticipants", async () => {
    const id = new anchor.BN(Date.now() + 1);
    return program.methods
      .initRound(
        id,
        new anchor.BN(Math.floor(Date.now() / 1000) + 3600),
        1,
        true,
      )
      .accounts({
        round: roundPda(authority.publicKey, id),
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  // ------------------------------------------------------------------
  // One live round, deliberately short-lived, to drive the rest.
  const roundId = new anchor.BN(Date.now() + 2);
  const round = roundPda(authority.publicKey, roundId);
  const deadline = Math.floor(Date.now() / 1000) + 25;

  group("ronda de prueba");
  await accepts("se abre la ronda", async () =>
    program.methods
      .initRound(roundId, new anchor.BN(deadline), 2, true)
      .accounts({
        round,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
  );

  // ------------------------------------------------------------------
  group("join_round — perfil y cupo");

  await refuses("handle más largo que 32 bytes", "ProfileTooLong", async () =>
    program.methods
      .joinRound(roundId, { founder: {} }, "x".repeat(33), "https://a.io")
      .accounts({
        round,
        participant: participantPda(round, authority.publicKey),
        wallet: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
  );

  await refuses("link más largo que 96 bytes", "ProfileTooLong", async () =>
    program.methods
      .joinRound(
        roundId,
        { founder: {} },
        "ok",
        "https://" + "y".repeat(96),
      )
      .accounts({
        round,
        participant: participantPda(round, authority.publicKey),
        wallet: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
  );

  await accepts("un perfil válido entra", async () =>
    program.methods
      .joinRound(roundId, { founder: {} }, "@negativo", "https://ronda.io")
      .accounts({
        round,
        participant: participantPda(round, authority.publicKey),
        wallet: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
  );

  // ------------------------------------------------------------------
  group("close_round — orden y quórum");

  await refuses("cerrar antes de la fecha límite", "RoundStillOpen", async () =>
    program.methods
      .closeRound(roundId)
      .accounts({ round, authority: authority.publicKey })
      .rpc(),
  );

  group("run_matching — precondiciones de estado");

  await refuses(
    "emparejar con la ronda todavía abierta",
    "WrongRoundStatus",
    async () =>
      program.methods
        .runMatching(roundId, 64)
        .accounts({ round, matchState: matchStatePda(round) })
        .rpc(),
  );

  // The status guard runs before the tick-budget guard, so an open round
  // always answers WrongRoundStatus first. Asserting that order is worth as
  // much as asserting either guard alone: it is what stops a zero budget from
  // ever reaching the loop.
  await refuses(
    "el estado se valida antes que el presupuesto de ticks",
    "WrongRoundStatus",
    async () =>
      program.methods
        .runMatching(roundId, 0)
        .accounts({ round, matchState: matchStatePda(round) })
        .rpc(),
  );

  // ------------------------------------------------------------------
  group("esperando la fecha límite para probar el cierre");
  const waitMs = Math.max(
    0,
    (deadline - Math.floor(Date.now() / 1000) + 3) * 1000,
  );
  console.log("  (" + Math.round(waitMs / 1000) + "s)");
  await sleep(waitMs);

  // A wallet that has never joined, so the refusal is the deadline and not
  // "this participant account already exists".
  const latecomer = await freshWallet(l1, authority);
  await refuses("unirse después de la fecha límite", "RoundClosed", async () =>
    programFor(l1, latecomer)
      .methods.joinRound(roundId, { builder: {} }, "@tarde", "https://a.io")
      .accounts({
        round,
        participant: participantPda(round, latecomer.publicKey),
        wallet: latecomer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
  );

  await refuses(
    "cerrar sin gente suficiente",
    "NotEnoughParticipants",
    async () =>
      program.methods
        .closeRound(roundId)
        .accounts({ round, authority: authority.publicKey })
        .rpc(),
  );

  // ------------------------------------------------------------------
  console.log("\n\x1b[1m" + passed + " pasaron, " + failed + " fallaron\x1b[0m");
  if (failures.length) {
    console.log("\nfallas:");
    for (const f of failures) console.log("  · " + f);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
