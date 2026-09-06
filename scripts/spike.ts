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
/** The VRF queue that serves ephemeral rollups. The round lives here. */
const EPHEMERAL_QUEUE = new PublicKey(
  "5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc",
);

const ROUND_SEED = Buffer.from("round");
const PARTICIPANT_SEED = Buffer.from("participant");
const PREFERENCES_SEED = Buffer.from("preferences");
const MATCH_STATE_SEED = Buffer.from("match_state");

const PROGRAM_ID = new PublicKey(IDL.address);

// 2 per side keeps the spike cheap; the interesting case (a builder dropping
// one founder for a better one) still shows up. `POOL=8 npx ts-node ...` runs
// a bigger market to measure how the single-transaction mode scales.
const POOL = Number(process.env.POOL || 2);
const FOUNDERS = POOL;
const BUILDERS = POOL;
/** "batch" runs the whole matching in one rollup tx; "step" is one tx per tick. */
const MODE = process.env.MODE || "batch";

/**
 * Rankings. For the 2x2 case they are hand-picked so a builder drops one
 * founder for a better proposal. For larger pools each participant ranks the
 * whole other side in a rotated order, which keeps plenty of contention.
 */
function rankingFor(side: "founder" | "builder", idx: number): number[] {
  if (POOL === 2) {
    return { "founder-0": [0, 1], "founder-1": [0, 1], "builder-0": [1, 0], "builder-1": [0, 1] }[
      `${side}-${idx}`
    ]!;
  }
  const n = side === "founder" ? BUILDERS : FOUNDERS;
  // Everyone's top choice clusters near index 0, so the early ticks are
  // maximally contended — the worst realistic case, not a friendly one.
  return Array.from({ length: n }, (_, i) => (i + idx * 2) % n).filter(
    (v, i, a) => a.indexOf(v) === i,
  );
}

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
    // transparent = true: this is a demo round, so it records every
    // intermediate state for the animation. A round with real people must pass
    // false — the proposal order is itself preference data.
    .initRound(roundId, deadline, 2, true)
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
    // The public devnet RPC rate-limits hard once a script drives more than a
    // handful of wallets. Pacing here is cheaper than a paid endpoint for now.
    await new Promise((r) => setTimeout(r, 700));
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

  // Randomness is requested here rather than at settle time so the oracle has
  // the whole open window to answer. Matching refuses to run without it.
  await erAuthorityProgram.methods
    .requestRoundRandomness(roundId)
    .accountsPartial({
      payer: authority.publicKey,
      round,
      oracleQueue: EPHEMERAL_QUEUE,
    })
    .rpc();
  ok("VRF requested against the ephemeral queue");

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
      .methods.submitRanking(roundId, Buffer.from(rankingFor(p.side, p.idx)))
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
  stage(7, "Wait for the VRF callback");
  {
    const started = Date.now();
    let fulfilled = false;
    while (Date.now() - started < 60_000) {
      const st: any = await (erAuthorityProgram.account as any).round.fetch(round);
      if (st.randomnessFulfilled) {
        fulfilled = true;
        ok(
          `randomness landed after ${Date.now() - started} ms: ` +
            Buffer.from(st.randomness).toString("hex").slice(0, 16) + "…",
        );
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!fulfilled) {
      fail("VRF callback never arrived — matching will refuse to run");
      process.exit(1);
    }
  }

  stage(8, "Close, ingest, and run the matching");
  console.log("   waiting for the deadline...");
  while (Math.floor(Date.now() / 1000) < deadline.toNumber()) {
    await new Promise((r) => setTimeout(r, 2000));
  }

  await erAuthorityProgram.methods
    .closeRound(roundId)
    .accountsPartial({ round })
    .rpc();
  ok("round closed");

  // Chunked so the account list always fits in one transaction.
  const CHUNK = 8;
  for (let i = 0; i < people.length; i += CHUNK) {
    await erAuthorityProgram.methods
      .sealPreferences(roundId)
      .accountsPartial({ round, matchState })
      .remainingAccounts(
        people.slice(i, i + CHUNK).map((p) => ({
          pubkey: prefsOf[`${p.side}-${p.idx}`],
          isSigner: false,
          isWritable: false,
        })),
      )
      .rpc();
  }
  ok(`rankings ingested into private working memory (${people.length} lists)`);

  const fmtPairs = (pairs: number[]): string =>
    pairs
      .slice(0, FOUNDERS)
      .map((b, f) => (b === 255 ? `F${f}:—` : `F${f}↔B${b}`))
      .join("  ");

  if (MODE === "step") {
    // One transaction per tick. Honest about what dominates: the wall-clock
    // number here is a round-trip to the validator, not rollup execution.
    for (let i = 0; i < 64; i++) {
      const before = Date.now();
      await erAuthorityProgram.methods
        .tick(roundId)
        .accountsPartial({ round, matchState })
        .rpc();
      const state: any = await (erAuthorityProgram.account as any).round.fetch(round);
      console.log(
        `   tick ${String(state.tick).padStart(2)}  ${fmtPairs(
          Array.from(state.pairs),
        )}   (${Date.now() - before} ms round-trip)`,
      );
      if (state.status.settled) {
        ok(`converged after ${state.tick} ticks`);
        break;
      }
    }
  } else {
    // The whole matching in one rollup transaction.
    const before = Date.now();
    const sig = await erAuthorityProgram.methods
      .runMatching(roundId, 64)
      .accountsPartial({ round, matchState })
      .rpc();
    const elapsed = Date.now() - before;

    const state: any = await (erAuthorityProgram.account as any).round.fetch(round);

    // The animation is replayed from the round's recorded history, NOT from
    // transaction logs: the TEE does not serve logs for transactions that touch
    // private accounts (verified — getTransaction returns zero log messages).
    // And the history only exists at all because this round is transparent.
    const historyLen = state.historyLen as number;
    for (let t = 0; t < historyLen; t++) {
      console.log(
        `   tick ${String(t + 1).padStart(2)}  ${fmtPairs(Array.from(state.history[t]))}`,
      );
    }
    console.log(
      `   tick ${String(state.tick).padStart(2)}  ${fmtPairs(Array.from(state.pairs))}  final`,
    );

    ok(`converged after ${state.tick} ticks in ONE transaction`);
    ok(`recorded ${historyLen} intermediate frames (round is transparent)`);
    ok(`client wall clock: ${elapsed} ms (one round-trip, not ${state.tick})`);
    console.log(`   explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    ok(`total proposals recorded on chain: ${state.totalProposals}`);
  }

  // ---------------------------------------------------------------------
  stage(9, "Commit the round back to L1");

  await erAuthorityProgram.methods
    .undelegateRound(roundId)
    .accountsPartial({ payer: authority.publicKey, round })
    .rpc();
  ok("undelegate submitted");

  // The commit is asynchronous: the rollup hands the account back to the
  // delegation program, which writes it to L1 a moment later.
  {
    const started = Date.now();
    let back = false;
    while (Date.now() - started < 60_000) {
      const info = await l1.getAccountInfo(round);
      if (info && info.owner.equals(PROGRAM_ID)) {
        const st: any = await (l1Program.account as any).round.fetch(round);
        ok(
          `round is back on L1 after ${Date.now() - started} ms · ` +
            `${fmtPairs(Array.from(st.pairs))}`,
        );
        back = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!back) fail("round never came back to L1 within 60s");
  }

  // ---------------------------------------------------------------------
  stage(10, "Destroy the rankings");

  {
    let closed = 0;
    for (const p of people) {
      const prefs = prefsOf[`${p.side}-${p.idx}`];
      try {
        await erAuthorityProgram.methods
          .closePreferences(roundId)
          .accountsPartial({
            payer: authority.publicKey,
            owner: p.kp.publicKey,
            round,
            preferences: prefs,
            preferencesPermission: permissionPdaFromAccount(prefs),
          })
          .rpc();
        closed++;
      } catch (e: any) {
        fail(`close ${p.side}-${p.idx}: ${e.message}`);
      }
    }
    ok(`${closed}/${people.length} preference accounts closed`);

    await erAuthorityProgram.methods
      .closeMatchState(roundId)
      .accountsPartial({
        payer: authority.publicKey,
        round,
        matchState,
        matchStatePermission: permissionPdaFromAccount(matchState),
      })
      .rpc();
    ok("working memory closed");

    // The README claims nothing survives. Check it rather than assert it.
    const gone = await erAuthority.getAccountInfo(prefsOf["founder-0"]);
    const msGone = await erAuthority.getAccountInfo(matchState);
    if (!gone || gone.data.length === 0) ok("a ranking account is gone from the rollup");
    else fail(`ranking account still holds ${gone.data.length} bytes`);
    if (!msGone || msGone.data.length === 0) ok("working memory is gone from the rollup");
    else fail(`working memory still holds ${msGone.data.length} bytes`);

    // And it must never have reached L1 in the first place.
    const onL1 = await l1.getAccountInfo(prefsOf["founder-0"]);
    if (!onL1) ok("that ranking never existed on L1");
    else fail("a ranking exists on L1 — it should never have been committed");
  }


  console.log("\n\x1b[1mSpike complete.\x1b[0m");
}

main().catch((e) => {
  console.error("\n\x1b[31mspike failed:\x1b[0m", e);
  process.exit(1);
});
