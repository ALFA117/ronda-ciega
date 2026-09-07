/**
 * Seed demo rounds for the video.
 *
 * Three rounds, each making a different point:
 *
 *   1. "settled-transparent" — the one to film. Recorded frames, so the
 *      algorithm can be watched resolving, including a builder dropping one
 *      founder for a better proposal.
 *   2. "settled-private"     — the same flow with `transparent: false`. It has
 *      no history at all, which is the strongest moment in the pitch: you
 *      cannot watch a real round, and neither can we.
 *   3. "open"                — still accepting people, so the join and seal
 *      flow can be demoed live from a wallet.
 *
 *   npx ts-node scripts/seed.ts
 *   ONLY=open npx ts-node scripts/seed.ts     # just one of them
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
const PARTICIPANT_SEED = Buffer.from("participant");
const PREFERENCES_SEED = Buffer.from("preferences");
const MATCH_STATE_SEED = Buffer.from("match_state");

/**
 * Handles that read like people, not fixtures. `founder-0` on screen tells a
 * judge the demo is synthetic before you have said a word.
 */
const ALL_FOUNDERS = [
  { handle: "@sofia.eth", link: "sofia.build" },
  { handle: "@marco_gtm", link: "github.com/marcogtm" },
  { handle: "@lucia.pm", link: "lucia.dev" },
  { handle: "@tomas", link: "x.com/tomasbuilds" },
  { handle: "@vale.ops", link: "valeria.co" },
  { handle: "@diego", link: "x.com/diegoships" },
  { handle: "@ceci.gtm", link: "cecilia.mx" },
  { handle: "@bruno", link: "github.com/brunolat" },
];

const ALL_BUILDERS = [
  { handle: "@karla.rs", link: "github.com/karlars" },
  { handle: "@nico_zk", link: "nico.xyz" },
  { handle: "@ana.sol", link: "github.com/anasol" },
  { handle: "@rafa", link: "x.com/rafacodes" },
  { handle: "@ivan.anchor", link: "github.com/ivanc" },
  { handle: "@pau_ml", link: "paula.dev" },
  { handle: "@seba.sol", link: "github.com/sebas" },
  { handle: "@mia.rs", link: "mia.build" },
];

/** `POOL=6 npx ts-node scripts/seed.ts` widens the market. */
const POOL = Math.min(Number(process.env.POOL || 4), 8);
const FOUNDERS = ALL_FOUNDERS.slice(0, POOL);
const BUILDERS = ALL_BUILDERS.slice(0, POOL);

/**
 * Rankings.
 *
 * The first four are hand-picked so the replay has a story: sofia and lucia
 * both open on karla, karla prefers lucia, so sofia is displaced on tick 2.
 * Beyond four, lists are generated with overlapping top choices so a larger
 * pool still produces contention rather than everyone matching on tick 1.
 */
const SEED_FOUNDER = [
  [0, 1, 2, 3],
  [1, 2, 0, 3],
  [0, 2, 1, 3],
  [3, 2, 1, 0],
];
const SEED_BUILDER = [
  [2, 0, 1, 3],
  [0, 1, 3, 2],
  [1, 0, 3, 2],
  [3, 1, 0, 2],
];

function rankingFor(seed: number[][], idx: number, n: number): number[] {
  const base = idx < seed.length ? seed[idx] : [];
  const rest = Array.from({ length: n }, (_, i) => i)
    // Bias later joiners toward the same early indices, so the top of the
    // market stays contested however wide the pool gets.
    .sort((a, b) => ((a + idx) % 3) - ((b + idx) % 3) || a - b);
  const out: number[] = [];
  for (const v of [...base, ...rest]) {
    if (v < n && !out.includes(v)) out.push(v);
  }
  return out;
}

const FOUNDER_RANKINGS = FOUNDERS.map((_, i) =>
  rankingFor(SEED_FOUNDER, i, BUILDERS.length),
);
const BUILDER_RANKINGS = BUILDERS.map((_, i) =>
  rankingFor(SEED_BUILDER, i, FOUNDERS.length),
);

const ONLY = process.env.ONLY;

function loadAuthority(): Keypair {
  const p = path.join(os.homedir(), ".config", "solana", "id.json");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))),
  );
}

const log = (m: string) => console.log(`   ${m}`);
const ok = (m: string) => console.log(`   \x1b[32mok\x1b[0m  ${m}`);
const head = (m: string) => console.log(`\n\x1b[1m── ${m}\x1b[0m`);

async function teeConn(kp: Keypair): Promise<Connection> {
  const { token } = await getAuthToken(TEE_RPC, kp.publicKey, async (msg) =>
    nacl.sign.detached(msg, kp.secretKey),
  );
  return new Connection(`${TEE_RPC}?token=${token}`, "confirmed");
}

function prog(connection: Connection, payer: Keypair): anchor.Program {
  return new anchor.Program(
    IDL as anchor.Idl,
    new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
      commitment: "confirmed",
    }),
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function seedRound(
  authority: Keypair,
  l1: Connection,
  opts: { transparent: boolean; settle: boolean; label: string; windowSec: number },
) {
  head(`${opts.label}  (transparent=${opts.transparent}, settle=${opts.settle})`);

  const roundId = new anchor.BN(Date.now());
  const [round] = PublicKey.findProgramAddressSync(
    [ROUND_SEED, authority.publicKey.toBuffer(), roundId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  );
  const [matchState] = PublicKey.findProgramAddressSync(
    [MATCH_STATE_SEED, round.toBuffer()],
    PROGRAM_ID,
  );

  const l1Program = prog(l1, authority);
  const deadline = new anchor.BN(
    Math.floor(Date.now() / 1000) + opts.windowSec,
  );

  await l1Program.methods
    .initRound(roundId, deadline, 2, opts.transparent)
    .accountsPartial({
      authority: authority.publicKey,
      round,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  ok(`round ${round.toBase58()}`);

  // People
  const people: {
    kp: Keypair;
    side: "founder" | "builder";
    idx: number;
    handle: string;
    link: string;
  }[] = [];
  FOUNDERS.forEach((f, i) =>
    people.push({ kp: Keypair.generate(), side: "founder", idx: i, ...f }),
  );
  BUILDERS.forEach((b, i) =>
    people.push({ kp: Keypair.generate(), side: "builder", idx: i, ...b }),
  );

  const fund = new Transaction();
  for (const p of people) {
    fund.add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: p.kp.publicKey,
        lamports: 0.04 * LAMPORTS_PER_SOL,
      }),
    );
  }
  await anchor.web3.sendAndConfirmTransaction(l1, fund, [authority]);
  ok(`funded ${people.length} wallets`);

  for (const p of people) {
    const [participant] = PublicKey.findProgramAddressSync(
      [PARTICIPANT_SEED, round.toBuffer(), p.kp.publicKey.toBuffer()],
      PROGRAM_ID,
    );
    await prog(l1, p.kp)
      .methods.joinRound(
        roundId,
        p.side === "founder" ? { founder: {} } : { builder: {} },
        p.handle,
        p.link,
      )
      .accountsPartial({
        wallet: p.kp.publicKey,
        round,
        participant,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await wait(700); // public RPC rate limit
  }
  ok(`${people.length} joined`);

  // Delegate + working memory + randomness
  await l1Program.methods
    .delegateRound(roundId)
    .accountsPartial({
      authority: authority.publicKey,
      round,
      validator: TEE_VALIDATOR,
    })
    .rpc();

  const er = await teeConn(authority);
  const erProgram = prog(er, authority);

  await erProgram.methods
    .initMatchState(roundId)
    .accountsPartial({
      payer: authority.publicKey,
      round,
      matchState,
      matchStatePermission: permissionPdaFromAccount(matchState),
    })
    .rpc();

  await erProgram.methods
    .requestRoundRandomness(roundId)
    .accountsPartial({
      payer: authority.publicKey,
      round,
      oracleQueue: EPHEMERAL_QUEUE,
    })
    .rpc();
  ok("delegated, working memory created, VRF requested");

  // Private rankings
  const prefsOf: Record<string, PublicKey> = {};
  for (const p of people) {
    const [participant] = PublicKey.findProgramAddressSync(
      [PARTICIPANT_SEED, round.toBuffer(), p.kp.publicKey.toBuffer()],
      PROGRAM_ID,
    );
    const [preferences] = PublicKey.findProgramAddressSync(
      [PREFERENCES_SEED, round.toBuffer(), p.kp.publicKey.toBuffer()],
      PROGRAM_ID,
    );
    prefsOf[`${p.side}-${p.idx}`] = preferences;

    const ranking =
      p.side === "founder" ? FOUNDER_RANKINGS[p.idx] : BUILDER_RANKINGS[p.idx];

    const conn = await teeConn(p.kp);
    await prog(conn, p.kp)
      .methods.submitRanking(roundId, Buffer.from(ranking))
      .accountsPartial({
        wallet: p.kp.publicKey,
        round,
        participant,
        preferences,
        preferencesPermission: permissionPdaFromAccount(preferences),
      })
      .rpc();
  }
  ok(`${people.length} rankings sealed (contents never logged)`);

  if (!opts.settle) {
    ok(`left OPEN — closes in ~${Math.round(opts.windowSec / 60)} min`);
    console.log(`   https://ronda-ciega.vercel.app/round/${round.toBase58()}`);
    return round;
  }

  // Wait for VRF, then settle
  const t0 = Date.now();
  for (;;) {
    const st: any = await (erProgram.account as any).round.fetch(round);
    if (st.randomnessFulfilled) {
      ok(`VRF landed in ${Date.now() - t0} ms`);
      break;
    }
    if (Date.now() - t0 > 60_000) throw new Error("VRF never arrived");
    await wait(2000);
  }

  while (Math.floor(Date.now() / 1000) < deadline.toNumber()) {
    log("waiting for the deadline…");
    await wait(5000);
  }

  await erProgram.methods
    .closeRound(roundId)
    .accountsPartial({ round })
    .rpc();

  for (let i = 0; i < people.length; i += 8) {
    await erProgram.methods
      .sealPreferences(roundId)
      .accountsPartial({ round, matchState })
      .remainingAccounts(
        people.slice(i, i + 8).map((p) => ({
          pubkey: prefsOf[`${p.side}-${p.idx}`],
          isSigner: false,
          isWritable: false,
        })),
      )
      .rpc();
  }

  const started = Date.now();
  await erProgram.methods
    .runMatching(roundId, 64)
    .accountsPartial({ round, matchState })
    .rpc();
  const elapsed = Date.now() - started;

  const final: any = await (erProgram.account as any).round.fetch(round);
  const pairs = Array.from(final.pairs as number[])
    .slice(0, FOUNDERS.length)
    .map((b, f) =>
      b === 255
        ? `${FOUNDERS[f].handle} — unmatched`
        : `${FOUNDERS[f].handle} ↔ ${BUILDERS[b].handle}`,
    );
  ok(`matched in ${final.tick} ticks / ${elapsed} ms / one transaction`);
  pairs.forEach((p) => log(p));
  ok(`history frames: ${final.historyLen} (0 means nothing to animate — that is the point)`);

  // Destroy the private accounts before the round leaves. Closing needs the
  // round as its rent sponsor, and once it is committed back to L1 the rollup
  // can no longer write it — undelegating first orphans every ranking.
  let closed = 0;
  for (const p of people) {
    const prefs = prefsOf[`${p.side}-${p.idx}`];
    try {
      await erProgram.methods
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
    } catch {
      /* already gone */
    }
  }
  await erProgram.methods
    .closeMatchState(roundId)
    .accountsPartial({
      payer: authority.publicKey,
      round,
      matchState,
      matchStatePermission: permissionPdaFromAccount(matchState),
    })
    .rpc();
  ok(`${closed} rankings and the working memory destroyed inside the enclave`);

  await erProgram.methods
    .undelegateRound(roundId)
    .accountsPartial({ payer: authority.publicKey, round })
    .rpc();
  ok("committed back to L1");

  console.log(`   https://ronda-ciega.vercel.app/round/${round.toBase58()}`);
  return round;
}

async function main() {
  const authority = loadAuthority();
  const l1 = new Connection(DEVNET, "confirmed");
  const bal = await l1.getBalance(authority.publicKey);
  console.log(`authority ${authority.publicKey.toBase58()}`);
  console.log(`balance   ${(bal / LAMPORTS_PER_SOL).toFixed(3)} SOL`);

  const jobs = [
    {
      key: "transparent",
      opts: {
        transparent: true,
        settle: true,
        label: "Settled + transparent (the one to film)",
        windowSec: 45,
      },
    },
    {
      key: "private",
      opts: {
        transparent: false,
        settle: true,
        label: "Settled + private (nothing to animate, by design)",
        windowSec: 45,
      },
    },
    {
      key: "open",
      opts: {
        transparent: true,
        settle: false,
        label: "Open (join and seal live from a wallet)",
        windowSec: 60 * 60 * 6,
      },
    },
  ];

  for (const j of jobs) {
    if (ONLY && ONLY !== j.key) continue;
    await seedRound(authority, l1, j.opts);
  }

  console.log("\n\x1b[1mSeeding complete.\x1b[0m");
}

main().catch((e) => {
  console.error("\n\x1b[31mseed failed:\x1b[0m", e);
  process.exit(1);
});
