/**
 * What happens when two people act on the same round at the same moment?
 *
 * The interesting one is `join_round`: it reads `round.founder_count`, uses it
 * as the new participant's index, and writes the incremented value back. Read,
 * decide, write — the classic shape of a race. Solana is supposed to make that
 * safe by refusing to run two transactions that write the same account in
 * parallel, so the second one sees the first one's result.
 *
 * "Supposed to" is the part worth testing. Six wallets join at once and the
 * indices they end up with are checked for duplicates: a race would hand two
 * people the same index, and two founders at index 3 means the matching pairs
 * one of them and silently drops the other.
 *
 *   npx ts-node scripts/concurrency.ts
 */
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * The IDL the deployed site uses, not the one lying in target/.
 *
 * target/idl is a build artefact and gitignored, so it holds whatever branch
 * was built last. Building the session-keys branch and then running a script
 * on master produced a complaint about a missing sessionToken account — an
 * error about a program that has no such account, raised by an IDL nobody
 * meant to be reading. frontend/lib/idl.json is committed and is what
 * ronda-ciega.vercel.app talks to, so a script claiming to exercise the
 * product should hold the same description of it.
 */
const IDL = require("../frontend/lib/idl.json");
const DEVNET = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(IDL.address);
const ROUND_SEED = Buffer.from("round");
const PARTICIPANT_SEED = Buffer.from("participant");

const RACERS = 6;

let passed = 0;
let failed = 0;

function ok(m: string) {
  passed++;
  console.log("  \x1b[32mok\x1b[0m    " + m);
}
function bad(m: string) {
  failed++;
  console.log("  \x1b[31mFAIL\x1b[0m  " + m);
}
function group(m: string) {
  console.log("\n\x1b[1m" + m + "\x1b[0m");
}

function loadAuthority(): Keypair {
  const p = path.join(os.homedir(), ".config", "solana", "id.json");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))),
  );
}

function programFor(connection: Connection, payer: Keypair): anchor.Program {
  return new anchor.Program(
    IDL as anchor.Idl,
    new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
      commitment: "confirmed",
      skipPreflight: false,
    }),
  );
}

async function main() {
  const authority = loadAuthority();
  const l1 = new Connection(DEVNET, "confirmed");
  const program = programFor(l1, authority);

  const balance = await l1.getBalance(authority.publicKey);
  console.log("saldo " + (balance / LAMPORTS_PER_SOL).toFixed(3) + " SOL");
  if (balance < 0.3 * LAMPORTS_PER_SOL) {
    console.log("\n\x1b[31mHacen falta 0.3 SOL.\x1b[0m");
    process.exit(1);
  }

  const roundId = new anchor.BN(Date.now());
  const [round] = PublicKey.findProgramAddressSync(
    [ROUND_SEED, authority.publicKey.toBuffer(), roundId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  );
  const partOf = (kp: Keypair) =>
    PublicKey.findProgramAddressSync(
      [PARTICIPANT_SEED, round.toBuffer(), kp.publicKey.toBuffer()],
      PROGRAM_ID,
    )[0];

  group("preparando");
  const racers = Array.from({ length: RACERS }, () => Keypair.generate());
  const fund = new Transaction();
  for (const kp of racers) {
    fund.add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: kp.publicKey,
        lamports: 0.03 * LAMPORTS_PER_SOL,
      }),
    );
  }
  await anchor.web3.sendAndConfirmTransaction(l1, fund, [authority], {
    commitment: "confirmed",
  });
  console.log("        " + RACERS + " billeteras fondeadas");

  await program.methods
    .initRound(roundId, new anchor.BN(Math.floor(Date.now() / 1000) + 600), 2, true)
    .accountsPartial({
      authority: authority.publicKey,
      round,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("        ronda " + round.toBase58());

  // ------------------------------------------------------------------
  group("seis registros a la vez, mismo lado");

  // Built and signed first, sent together: the point is to hand the cluster
  // six transactions that all want to write the same account at once.
  const sends = racers.map(async (kp, i) => {
    const ix = await program.methods
      .joinRound(roundId, { founder: {} }, "race-" + i, "https://r.io")
      .accounts({
        round,
        participant: partOf(kp),
        wallet: kp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const tx = new Transaction().add(ix);
    tx.feePayer = kp.publicKey;
    tx.recentBlockhash = (await l1.getLatestBlockhash("confirmed")).blockhash;
    tx.sign(kp);
    return l1.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  });

  const sigs = await Promise.allSettled(sends);
  const landed = sigs.filter((s) => s.status === "fulfilled").length;
  console.log("        " + landed + "/" + RACERS + " transacciones enviadas");

  // Give the cluster a moment to confirm all of them.
  await new Promise((r) => setTimeout(r, 12000));

  // ------------------------------------------------------------------
  group("qué quedó escrito");

  const accounts = await Promise.all(
    racers.map((kp) => l1.getAccountInfo(partOf(kp))),
  );
  const present = accounts.filter((a) => a !== null).length;

  const decoded = await Promise.all(
    racers.map(async (kp) => {
      try {
        return await (program.account as any).participant.fetch(partOf(kp));
      } catch {
        return null;
      }
    }),
  );
  const indices = decoded.filter(Boolean).map((p: any) => p.index as number);
  const round1: any = await (program.account as any).round.fetch(round);

  console.log("        índices asignados: " + JSON.stringify(indices.sort((a, b) => a - b)));
  console.log("        founder_count en la ronda: " + round1.founderCount);

  if (new Set(indices).size === indices.length) {
    ok("ningún índice se repitió entre " + indices.length + " registros simultáneos");
  } else {
    bad("dos personas comparten índice — hay una carrera real");
  }

  const expected = Array.from({ length: indices.length }, (_, i) => i);
  if (JSON.stringify(indices.sort((a, b) => a - b)) === JSON.stringify(expected)) {
    ok("los índices son consecutivos desde 0, sin huecos");
  } else {
    bad("los índices tienen huecos: " + JSON.stringify(indices));
  }

  if (round1.founderCount === present) {
    ok("founder_count coincide con las cuentas que existen (" + present + ")");
  } else {
    bad(
      "founder_count dice " + round1.founderCount + " pero existen " + present + " cuentas",
    );
  }

  // ------------------------------------------------------------------
  group("el mismo se registra dos veces a la vez");

  const twice = racers[0];
  const before: any = await (program.account as any).round.fetch(round);

  const dup = await Promise.allSettled(
    [0, 1].map(async () => {
      const ix = await program.methods
        .joinRound(roundId, { builder: {} }, "dup", "https://r.io")
        .accounts({
          round,
          participant: partOf(twice),
          wallet: twice.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      const tx = new Transaction().add(ix);
      tx.feePayer = twice.publicKey;
      tx.recentBlockhash = (await l1.getLatestBlockhash("confirmed")).blockhash;
      tx.sign(twice);
      const sig = await l1.sendRawTransaction(tx.serialize(), { skipPreflight: true });
      await l1.confirmTransaction(sig, "confirmed");
      return sig;
    }),
  );

  // `confirmTransaction` resolving means the cluster reached a verdict, not
  // that the verdict was yes. A transaction sent with skipPreflight that fails
  // on chain still gets a signature and still confirms — reading only the
  // promise counts sends, not successes, and reported a duplicate that never
  // happened.
  const signatures = dup
    .filter((d): d is PromiseFulfilledResult<string> => d.status === "fulfilled")
    .map((d) => d.value);
  const statuses = await l1.getSignatureStatuses(signatures);
  const succeeded = statuses.value.filter((s) => s && s.err === null).length;

  const after: any = await (program.account as any).round.fetch(round);
  console.log(
    "        enviadas " + signatures.length + ", exitosas " + succeeded +
      ", builder_count " + before.builderCount + " → " + after.builderCount,
  );

  if (succeeded === 0) {
    ok("ninguna pasó: la cuenta de participante ya existía");
  } else {
    bad(succeeded + " pasaron — alguien se registró dos veces");
  }

  if (after.builderCount === before.builderCount) {
    ok("builder_count no se movió");
  } else {
    bad("builder_count subió de " + before.builderCount + " a " + after.builderCount);
  }

  // ------------------------------------------------------------------
  console.log("\n\x1b[1m" + passed + " pasaron, " + failed + " fallaron\x1b[0m");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
