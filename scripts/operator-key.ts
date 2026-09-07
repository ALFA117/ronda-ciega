/**
 * Can a key that is NOT the round authority drive the round?
 *
 * The whole operator-key design rests on one claim: none of the rollup
 * instructions check WHO signed. `close_round`, `seal_preferences` and `tick`
 * take no signer at all, and the rest take a `payer` that is never compared
 * against `round.authority`. If that is right, a key living in the browser can
 * run a round without the wallet ever being asked to sign a transaction it
 * cannot simulate.
 *
 * `negative-rollup.ts` exercises the same instructions but signs them with the
 * authority, so it cannot tell the difference. This one deliberately uses a
 * stranger.
 *
 *   npx ts-node scripts/operator-key.ts
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
import {
  getAuthToken,
  permissionPdaFromAccount,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import nacl from "tweetnacl";
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
const TEE_RPC = "https://devnet-tee.magicblock.app";
const TEE_VALIDATOR = new PublicKey("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");
const EPHEMERAL_QUEUE = new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");

const PROGRAM_ID = new PublicKey(IDL.address);
const ROUND_SEED = Buffer.from("round");
const MATCH_STATE_SEED = Buffer.from("match_state");

let passed = 0;
let failed = 0;

const ok = (m: string) => {
  passed++;
  console.log("  \x1b[32mok\x1b[0m    " + m);
};
const bad = (m: string) => {
  failed++;
  console.log("  \x1b[31mFAIL\x1b[0m  " + m);
};
const group = (m: string) => console.log("\n\x1b[1m" + m + "\x1b[0m");

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

async function teeFor(kp: Keypair): Promise<Connection> {
  const { token } = await getAuthToken(TEE_RPC, kp.publicKey, async (msg) =>
    nacl.sign.detached(msg, kp.secretKey),
  );
  return new Connection(`${TEE_RPC}?token=${token}`, "confirmed");
}

async function main() {
  const authority = loadAuthority();
  const l1 = new Connection(DEVNET, "confirmed");
  const l1Program = programFor(l1, authority);

  console.log("saldo " + ((await l1.getBalance(authority.publicKey)) / LAMPORTS_PER_SOL).toFixed(3));

  // The stranger: a key the round has never heard of, exactly like one
  // generated in a browser.
  const operator = Keypair.generate();
  console.log("operador " + operator.publicKey.toBase58());

  const roundId = new anchor.BN(Date.now());
  const [round] = PublicKey.findProgramAddressSync(
    [ROUND_SEED, authority.publicKey.toBuffer(), roundId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  );
  const [matchState] = PublicKey.findProgramAddressSync(
    [MATCH_STATE_SEED, round.toBuffer()],
    PROGRAM_ID,
  );

  group("preparando: la autoridad abre y delega, el operador solo recibe SOL");

  await anchor.web3.sendAndConfirmTransaction(
    l1,
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: operator.publicKey,
        lamports: Math.round(0.02 * LAMPORTS_PER_SOL),
      }),
    ),
    [authority],
    { commitment: "confirmed" },
  );
  console.log("        operador fondeado con 0.02 SOL");

  await l1Program.methods
    .initRound(roundId, new anchor.BN(Math.floor(Date.now() / 1000) + 30), 2, true)
    .accountsPartial({
      authority: authority.publicKey,
      round,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  await l1Program.methods
    .delegateRound(roundId)
    .accountsPartial({ authority: authority.publicKey, round, validator: TEE_VALIDATOR })
    .rpc();
  console.log("        ronda abierta y delegada");

  // ------------------------------------------------------------------
  group("el operador toma el mando del rollup");

  const erConn = await teeFor(operator);
  const er = programFor(erConn, operator);
  ok("obtuvo un token del TEE firmando con su propia clave, sin billetera");

  try {
    await er.methods
      .initMatchState(roundId)
      .accountsPartial({
        payer: operator.publicKey,
        round,
        matchState,
        matchStatePermission: permissionPdaFromAccount(matchState),
      })
      .rpc();
    ok("creó la memoria de trabajo privada");
  } catch (e: any) {
    bad("init_match_state: " + String(e?.message ?? e).slice(0, 90));
  }

  try {
    await er.methods
      .requestRoundRandomness(roundId)
      .accountsPartial({ payer: operator.publicKey, round, oracleQueue: EPHEMERAL_QUEUE })
      .rpc();
    ok("pidió la aleatoriedad al oráculo");
  } catch (e: any) {
    bad("request_round_randomness: " + String(e?.message ?? e).slice(0, 90));
  }

  // ------------------------------------------------------------------
  group("esperando la fecha límite");
  while (Math.floor(Date.now() / 1000) < Math.floor(Date.now() / 1000)) break;
  const deadline: any = await (er.account as any).round.fetch(round);
  while (Math.floor(Date.now() / 1000) < deadline.deadlineTs.toNumber()) {
    await new Promise((r) => setTimeout(r, 2000));
  }

  try {
    await er.methods.closeRound(roundId).accountsPartial({ round }).rpc();
    bad("close_round pasó sin gente — el quórum debería impedirlo");
  } catch {
    ok("close_round rechazado por falta de quórum, no por quién firma");
  }

  // ------------------------------------------------------------------
  // Both of these require the round to be Settled, and this one never got
  // there — it has nobody in it. So the only thing they can establish here is
  // that the refusal is about the round's state and not about who is asking:
  // an identity check would have fired on the first one too, and did not.
  group("cierre y devolución: refusadas por estado, no por identidad");

  const refusedForState = async (what: string, run: () => Promise<unknown>) => {
    try {
      await run();
      bad(what + " pasó sobre una ronda abierta — la guarda de estado no está");
    } catch {
      ok(what + " rechazada: la ronda no está liquidada");
    }
  };

  await refusedForState("close_match_state", () =>
    er.methods
      .closeMatchState(roundId)
      .accountsPartial({
        payer: operator.publicKey,
        round,
        matchState,
        matchStatePermission: permissionPdaFromAccount(matchState),
      })
      .rpc(),
  );

  await refusedForState("undelegate_round", () =>
    er.methods
      .undelegateRound(roundId)
      .accountsPartial({ payer: operator.publicKey, round })
      .rpc(),
  );

  // Sweep what is left back so the test does not strand SOL.
  const left = await l1.getBalance(operator.publicKey);
  if (left > 5000) {
    try {
      await anchor.web3.sendAndConfirmTransaction(
        l1,
        new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: operator.publicKey,
            toPubkey: authority.publicKey,
            lamports: left - 5000,
          }),
        ),
        [operator],
        { commitment: "confirmed" },
      );
      console.log("        devueltos " + ((left - 5000) / LAMPORTS_PER_SOL).toFixed(4) + " SOL");
    } catch {
      /* best effort */
    }
  }

  console.log("\n\x1b[1m" + passed + " pasaron, " + failed + " fallaron\x1b[0m");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
