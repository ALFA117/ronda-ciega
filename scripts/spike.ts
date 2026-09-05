/**
 * Spike: does the whole mechanism actually work on MagicBlock's TEE rollup?
 *
 * The gate this script exists to answer is stage 6: a wallet that is not a
 * member of a Preferences account's permission must NOT be able to read it,
 * while its owner must. Everything else here is scaffolding around that check.
 *
 *   npx ts-node scripts/spike.ts
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
  verifyTeeRpcIntegrity,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import nacl from "tweetnacl";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const IDL = require("../target/idl/ronda_ciega.json");

const DEVNET = "https://api.devnet.solana.com";
const TEE_RPC = "https://devnet-tee.magicblock.app";
const TEE_VALIDATOR = new PublicKey(
  "MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo",
);

const ROUND_SEED = Buffer.from("round");
const PARTICIPANT_SEED = Buffer.from("participant");
const PREFERENCES_SEED = Buffer.from("preferences");
const MATCH_STATE_SEED = Buffer.from("match_state");

const PROGRAM_ID = new PublicKey(IDL.address);

// 2 per side keeps the spike cheap; the interesting case (a builder dropping
// one founder for a better one) still shows up.
const FOUNDERS = 2;
const BUILDERS = 2;

function loadAuthority(): Keypair {
  const p = path.join(os.homedir(), ".config", "solana", "id.json");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))),
  );
}

function stage(n: number, title: string) {
  console.log(`\n\x1b[1m── ${n}. ${title}\x1b[0m`);
}

function ok(msg: string) {
  console.log(`   \x1b[32mok\x1b[0m  ${msg}`);
}

function fail(msg: string) {
  console.log(`   \x1b[31mFAIL\x1b[0m ${msg}`);
}

/** The TEE RPC only answers for a wallet that signed an auth challenge. */
async function teeConnectionFor(kp: Keypair): Promise<Connection> {
  const { token } = await getAuthToken(TEE_RPC, kp.publicKey, async (msg) =>
    nacl.sign.detached(msg, kp.secretKey),
  );
  return new Connection(`${TEE_RPC}?token=${token}`, "confirmed");
}

function programFor(connection: Connection, payer: Keypair): anchor.Program {
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(payer),
    { commitment: "confirmed", skipPreflight: false },
  );
  return new anchor.Program(IDL as anchor.Idl, provider);
}

async function main() {
  const authority = loadAuthority();
  const roundId = new anchor.BN(Date.now());
  const l1 = new Connection(DEVNET, "confirmed");

  console.log(`program   ${PROGRAM_ID.toBase58()}`);
  console.log(`authority ${authority.publicKey.toBase58()}`);
  console.log(`round id  ${roundId.toString()}`);

  const [round] = PublicKey.findProgramAddressSync(
    [ROUND_SEED, authority.publicKey.toBuffer(), roundId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  );
  const [matchState] = PublicKey.findProgramAddressSync(
    [MATCH_STATE_SEED, round.toBuffer()],
    PROGRAM_ID,
  );

  // ---------------------------------------------------------------------
  stage(1, "Fund burner participants on devnet");

  const people: { kp: Keypair; side: "founder" | "builder"; idx: number }[] = [];
  for (let i = 0; i < FOUNDERS; i++) {
    people.push({ kp: Keypair.generate(), side: "founder", idx: i });
  }
  for (let i = 0; i < BUILDERS; i++) {
    people.push({ kp: Keypair.generate(), side: "builder", idx: i });
  }

  const fundTx = new Transaction();
  for (const p of people) {
    fundTx.add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: p.kp.publicKey,
        lamports: 0.05 * LAMPORTS_PER_SOL,
      }),
    );
  }
  await anchor.web3.sendAndConfirmTransaction(l1, fundTx, [authority]);
  ok(`funded ${people.length} burners with 0.05 SOL each`);

  // ---------------------------------------------------------------------
  stage(2, "Open the round on L1");

  const l1Program = programFor(l1, authority);
  const deadline = new anchor.BN(Math.floor(Date.now() / 1000) + 60);

  await l1Program.methods
    .initRound(roundId, deadline, 2)
    .accountsPartial({
      authority: authority.publicKey,
      round,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  ok(`round ${round.toBase58()}`);

  // ---------------------------------------------------------------------
  stage(3, "Everyone joins (public profiles)");

  for (const p of people) {
    const [participant] = PublicKey.findProgramAddressSync(
      [PARTICIPANT_SEED, round.toBuffer(), p.kp.publicKey.toBuffer()],
      PROGRAM_ID,
    );
    await programFor(l1, p.kp)
      .methods.joinRound(
        roundId,
        p.side === "founder" ? { founder: {} } : { builder: {} },
        `${p.side}-${p.idx}`,
        `https://build.magicblock.app/builders`,
      )
      .accountsPartial({
        wallet: p.kp.publicKey,
        round,
        participant,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    ok(`${p.side} #${p.idx} joined`);
  }

  // ---------------------------------------------------------------------
  stage(4, "Delegate the round to the TEE validator");

  await l1Program.methods
    .delegateRound(roundId)
    .accountsPartial({
      authority: authority.publicKey,
      round,
      validator: TEE_VALIDATOR,
    })
    .rpc();
  ok(`delegated to ${TEE_VALIDATOR.toBase58()}`);

  await verifyTeeRpcIntegrity(TEE_RPC);
  ok("TEE RPC attestation verified");

  // ---------------------------------------------------------------------
  stage(5, "Create private working memory + submit private rankings");

  const erAuthority = await teeConnectionFor(authority);
  const erAuthorityProgram = programFor(erAuthority, authority);

  await erAuthorityProgram.methods
    .initMatchState(roundId)
    .accountsPartial({
      payer: authority.publicKey,
      round,
      matchState,
      matchStatePermission: permissionPdaFromAccount(matchState),
    })
    .rpc();
  ok(`match state ${matchState.toBase58()} (private, no members)`);

  // Founder 0 and founder 1 both want builder 0 first. Builder 0 prefers
  // founder 1. So founder 0 gets bumped on a later tick and falls back to
  // builder 1 — the case worth watching in the demo.
  const rankings: Record<string, number[]> = {
    "founder-0": [0, 1],
    "founder-1": [0, 1],
    "builder-0": [1, 0],
    "builder-1": [0, 1],
  };

  const prefsOf: Record<string, PublicKey> = {};
  for (const p of people) {
    const key = `${p.side}-${p.idx}`;
    const [participant] = PublicKey.findProgramAddressSync(
      [PARTICIPANT_SEED, round.toBuffer(), p.kp.publicKey.toBuffer()],
      PROGRAM_ID,
    );
    const [preferences] = PublicKey.findProgramAddressSync(
      [PREFERENCES_SEED, round.toBuffer(), p.kp.publicKey.toBuffer()],
      PROGRAM_ID,
    );
    prefsOf[key] = preferences;

    const erConn = await teeConnectionFor(p.kp);
    await programFor(erConn, p.kp)
      .methods.submitRanking(roundId, Buffer.from(rankings[key]))
      .accountsPartial({
        wallet: p.kp.publicKey,
        round,
        participant,
        preferences,
        preferencesPermission: permissionPdaFromAccount(preferences),
      })
      .rpc();
    ok(`${key} submitted a ranking (contents never logged)`);
  }

  // ---------------------------------------------------------------------
  stage(6, "THE GATE — can an outsider read someone's preferences?");

  const target = prefsOf["founder-0"];
  const owner = people.find((p) => p.side === "founder" && p.idx === 0)!.kp;
  const outsider = people.find((p) => p.side === "builder" && p.idx === 1)!.kp;

  const ownerConn = await teeConnectionFor(owner);
  const ownerRead = await ownerConn.getAccountInfo(target);
  if (ownerRead && ownerRead.data.length > 0) {
    ok(`owner CAN read their own preferences (${ownerRead.data.length} bytes)`);
  } else {
    fail("owner could NOT read their own preferences — permission too strict");
  }

  const outsiderConn = await teeConnectionFor(outsider);
  let outsiderRead: any = null;
  let outsiderErr: string | null = null;
  try {
    outsiderRead = await outsiderConn.getAccountInfo(target);
  } catch (e: any) {
    outsiderErr = e.message;
  }
  if (outsiderErr) {
    ok(`outsider was REFUSED by the TEE: ${outsiderErr}`);
  } else if (!outsiderRead || outsiderRead.data.length === 0) {
    ok("outsider got nothing back — account is shielded");
  } else {
    fail(
      `outsider READ ${outsiderRead.data.length} bytes of someone else's ` +
        `preferences. The whole design rests on this being impossible.`,
    );
  }

  // Control. Without this, "got nothing back" proves nothing — it could just
  // mean this connection can't see rollup accounts at all. The outsider must
  // be able to read a PUBLIC rollup account over the very same connection.
  const controlRead = await outsiderConn.getAccountInfo(round);
  if (controlRead && controlRead.data.length > 0) {
    ok(
      `control: the same outsider connection CAN read the public round ` +
        `(${controlRead.data.length} bytes) — so the refusal above is the ` +
        `permission working, not a broken connection`,
    );
  } else {
    fail(
      "control FAILED: outsider cannot read the public round either, so the " +
        "shielding result above is inconclusive",
    );
  }

  const publicConn = new Connection(TEE_RPC, "confirmed");
  let anonRead: any = null;
  try {
    anonRead = await publicConn.getAccountInfo(target);
  } catch (e: any) {
    ok(`unauthenticated RPC refused: ${e.message}`);
  }
  if (anonRead && anonRead.data.length > 0) {
    fail(`unauthenticated RPC served ${anonRead.data.length} bytes`);
  } else if (!anonRead) {
    ok("unauthenticated RPC returned nothing");
  }

  // ---------------------------------------------------------------------
  stage(7, "Close, ingest, and run the matching one tick at a time");

  console.log("   waiting for the deadline...");
  while (Math.floor(Date.now() / 1000) < deadline.toNumber()) {
    await new Promise((r) => setTimeout(r, 2000));
  }

  await erAuthorityProgram.methods
    .closeRound(roundId)
    .accountsPartial({ round })
    .rpc();
  ok("round closed");

  await erAuthorityProgram.methods
    .sealPreferences(roundId)
    .accountsPartial({ round, matchState })
    .remainingAccounts(
      people.map((p) => ({
        pubkey: prefsOf[`${p.side}-${p.idx}`],
        isSigner: false,
        isWritable: false,
      })),
    )
    .rpc();
  ok("rankings ingested into private working memory");

  for (let i = 0; i < 32; i++) {
    const before = Date.now();
    await erAuthorityProgram.methods
      .tick(roundId)
      .accountsPartial({ round, matchState })
      .rpc();
    const state: any = await (erAuthorityProgram.account as any).round.fetch(round);
    const pairs = Array.from(state.pairs as number[])
      .slice(0, FOUNDERS)
      .map((b, f) => (b === 255 ? `F${f}:—` : `F${f}↔B${b}`))
      .join("  ");
    console.log(
      `   tick ${String(state.tick).padStart(2)}  ${pairs}   (${Date.now() - before} ms)`,
    );
    if (state.status.settled) {
      ok(`converged after ${state.tick} ticks`);
      break;
    }
  }

  console.log("\n\x1b[1mSpike complete.\x1b[0m");
}

main().catch((e) => {
  console.error("\n\x1b[31mspike failed:\x1b[0m", e);
  process.exit(1);
});
