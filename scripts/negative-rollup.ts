/**
 * Negative paths that only exist inside the rollup.
 *
 * `negative.ts` covers the guards reachable from L1. Everything else runs on a
 * round already delegated to the TEE, so proving those guards work means
 * standing up the whole lifecycle first: open, join, delegate, create private
 * working memory, and only then start breaking things.
 *
 * The fixture deliberately does NOT request randomness up front — the happy
 * path does, but a round without it is the only way to reach RandomnessMissing
 * and InvalidTickBudget, which sit behind the Matching status.
 *
 *   npx ts-node scripts/negative-rollup.ts
 *
 * Takes about three minutes, most of it waiting for a deadline, and costs
 * roughly 0.1 SOL of which the closes return most.
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
const TEE_VALIDATOR = new PublicKey(
  "MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo",
);
const EPHEMERAL_QUEUE = new PublicKey(
  "5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc",
);

const PROGRAM_ID = new PublicKey(IDL.address);
const ROUND_SEED = Buffer.from("round");
const PARTICIPANT_SEED = Buffer.from("participant");
const PREFERENCES_SEED = Buffer.from("preferences");
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

/** The TEE RPC only answers for a wallet that signed an auth challenge. */
async function teeConnectionFor(kp: Keypair): Promise<Connection> {
  const { token } = await getAuthToken(TEE_RPC, kp.publicKey, async (msg) =>
    nacl.sign.detached(msg, kp.secretKey),
  );
  return new Connection(`${TEE_RPC}?token=${token}`, "confirmed");
}

function group(title: string) {
  console.log("\n\x1b[1m" + title + "\x1b[0m");
}

function note(msg: string) {
  console.log("        \x1b[2m" + msg + "\x1b[0m");
}

/** Anchor numbers its errors from 6000 in declaration order. */
const CODE_OF: Record<string, number> = {
  DeadlineInPast: 6000,
  RoundClosed: 6001,
  RoundStillOpen: 6002,
  WrongRoundStatus: 6003,
  SideFull: 6004,
  NotEnoughParticipants: 6005,
  InvalidRanking: 6006,
  DuplicateInRanking: 6007,
  WrongRound: 6008,
  AlreadySealed: 6009,
  SealIncomplete: 6010,
  ProfileTooLong: 6011,
  InvalidSession: 6012,
  AlreadyClosed: 6013,
  InvalidPreferencesAccount: 6014,
  RandomnessAlreadyFulfilled: 6015,
  RandomnessMissing: 6016,
  InvalidTickBudget: 6017,
  MathOverflow: 6018,
  // Anchor's own constraint failures, which fire before the instruction body
  // and so are what a caller actually meets when they pass a foreign account.
  ConstraintSeeds: 2006,
  AccountDiscriminatorMismatch: 3002,
  AccountOwnedByWrongProgram: 3007,
};

/**
 * Everything the error object knows, flattened to one searchable string.
 *
 * The TEE serves no logs for a transaction that touches a private account, and
 * the thrown error's `message` comes back empty, so the usual
 * `e.error.errorCode.code` path finds nothing. What does survive is the raw
 * program error number, somewhere inside the object — which is why this walks
 * the whole thing, own and inherited properties alike, instead of reading two
 * fields and giving up.
 */
function deepBlob(e: any, depth = 0): string {
  if (e === null || e === undefined) return "";
  if (depth > 4) return "";
  if (typeof e !== "object") return String(e);
  const parts: string[] = [];
  const seen = new Set<string>();
  for (let o = e; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const k of Object.getOwnPropertyNames(o)) {
      if (seen.has(k) || k === "stack") continue;
      seen.add(k);
      let v: any;
      try {
        v = e[k];
      } catch {
        continue;
      }
      if (typeof v === "function") continue;
      parts.push(k + "=" + (typeof v === "object" ? deepBlob(v, depth + 1) : String(v)));
    }
  }
  return parts.join(" ");
}

/** Does this error carry the named program error, by name or by number? */
function carries(e: any, expected: string): boolean {
  const blob = deepBlob(e);
  if (blob.includes(expected)) return true;
  const n = CODE_OF[expected];
  if (n === undefined) return false;
  const hex = "0x" + n.toString(16);
  return blob.includes(hex) || new RegExp("\\b" + n + "\\b").test(blob);
}

async function refuses(
  what: string,
  expected: string,
  run: () => Promise<unknown>,
) {
  try {
    await run();
    failed++;
    failures.push(what + ": se ACEPTO, debia fallar con " + expected);
    console.log("  \x1b[31mFAIL\x1b[0m  " + what + " — se aceptó");
  } catch (e: any) {
    if (carries(e, expected)) {
      passed++;
      console.log("  \x1b[32mok\x1b[0m    " + what + " → " + expected);
    } else {
      failed++;
      const blob = deepBlob(e);
      const got =
        e?.error?.errorCode?.code ||
        (blob.match(/custom program error: (0x[0-9a-f]+)/) ?? [])[1] ||
        blob.slice(0, 160) ||
        "(error sin contenido)";
      failures.push(what + ": esperaba " + expected + ", llego " + got);
      console.log(
        "  \x1b[31mFAIL\x1b[0m  " + what + " — esperaba " + expected + ", llegó " + got,
      );
      if (process.env.DUMP === "1") {
        console.log("        \x1b[2m" + blob.slice(0, 900) + "\x1b[0m");
      }
    }
  }
}

async function accepts(what: string, run: () => Promise<unknown>) {
  try {
    await run();
    passed++;
    console.log("  \x1b[32mok\x1b[0m    " + what);
  } catch (e: any) {
    failed++;
    const got =
      e?.error?.errorCode?.code ?? String(e?.message ?? e).slice(0, 140);
    failures.push(what + ": debia aceptarse, fallo con " + got);
    console.log("  \x1b[31mFAIL\x1b[0m  " + what + " — " + got);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const authority = loadAuthority();
  const l1 = new Connection(DEVNET, "confirmed");
  const l1Program = programFor(l1, authority);

  const balance = await l1.getBalance(authority.publicKey);
  console.log("autoridad " + authority.publicKey.toBase58());
  console.log("saldo     " + (balance / LAMPORTS_PER_SOL).toFixed(3) + " SOL");
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.log("\n\x1b[31mHacen falta al menos 0.5 SOL.\x1b[0m");
    process.exit(1);
  }

  const roundId = new anchor.BN(Date.now());
  const [round] = PublicKey.findProgramAddressSync(
    [ROUND_SEED, authority.publicKey.toBuffer(), roundId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  );
  const [matchState] = PublicKey.findProgramAddressSync(
    [MATCH_STATE_SEED, round.toBuffer()],
    PROGRAM_ID,
  );

  const people: { kp: Keypair; side: "founder" | "builder"; idx: number }[] = [];
  for (let i = 0; i < 2; i++) people.push({ kp: Keypair.generate(), side: "founder", idx: i });
  for (let i = 0; i < 2; i++) people.push({ kp: Keypair.generate(), side: "builder", idx: i });

  const partOf = (kp: Keypair) =>
    PublicKey.findProgramAddressSync(
      [PARTICIPANT_SEED, round.toBuffer(), kp.publicKey.toBuffer()],
      PROGRAM_ID,
    )[0];
  const prefsOf = (kp: Keypair) =>
    PublicKey.findProgramAddressSync(
      [PREFERENCES_SEED, round.toBuffer(), kp.publicKey.toBuffer()],
      PROGRAM_ID,
    )[0];

  // ------------------------------------------------------------------
  group("montando la ronda");

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
  note("4 billeteras fondeadas");

  const deadline = new anchor.BN(Math.floor(Date.now() / 1000) + 75);
  await l1Program.methods
    .initRound(roundId, deadline, 2, true)
    .accountsPartial({
      authority: authority.publicKey,
      round,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  note("ronda abierta " + round.toBase58());

  for (const p of people) {
    await programFor(l1, p.kp)
      .methods.joinRound(
        roundId,
        p.side === "founder" ? { founder: {} } : { builder: {} },
        p.side + "-" + p.idx,
        "https://ronda-ciega.vercel.app",
      )
      .accountsPartial({
        wallet: p.kp.publicKey,
        round,
        participant: partOf(p.kp),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await sleep(700);
  }
  note("4 participantes registrados");

  await l1Program.methods
    .delegateRound(roundId)
    .accountsPartial({ authority: authority.publicKey, round, validator: TEE_VALIDATOR })
    .rpc();
  note("ronda delegada al TEE");

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
  note("memoria de trabajo privada creada — sin VRF a propósito");

  // Everyone needs their own authenticated TEE connection.
  const erOf = new Map<string, anchor.Program>();
  for (const p of people) {
    erOf.set(p.side + "-" + p.idx, programFor(await teeConnectionFor(p.kp), p.kp));
  }

  // ------------------------------------------------------------------
  // A second, minimal round. Its only job is to own one Preferences account
  // that belongs to a different round, which is the only way to reach the
  // WrongRound guard: `seal_preferences` reads `remaining_accounts`, and those
  // carry no Anchor constraints, so a foreign-but-genuine account gets all the
  // way to the body's own check instead of bouncing off a seeds constraint.
  group("segunda ronda, para tener preferencias ajenas");

  const otherId = new anchor.BN(Date.now() + 7);
  const [otherRound] = PublicKey.findProgramAddressSync(
    [ROUND_SEED, authority.publicKey.toBuffer(), otherId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  );
  const outsider = Keypair.generate();
  const outsiderPeer = Keypair.generate();

  await anchor.web3.sendAndConfirmTransaction(
    l1,
    new Transaction()
      .add(
        SystemProgram.transfer({
          fromPubkey: authority.publicKey,
          toPubkey: outsider.publicKey,
          lamports: 0.05 * LAMPORTS_PER_SOL,
        }),
      )
      .add(
        SystemProgram.transfer({
          fromPubkey: authority.publicKey,
          toPubkey: outsiderPeer.publicKey,
          lamports: 0.05 * LAMPORTS_PER_SOL,
        }),
      ),
    [authority],
  );

  await l1Program.methods
    .initRound(otherId, new anchor.BN(Math.floor(Date.now() / 1000) + 900), 2, true)
    .accountsPartial({
      authority: authority.publicKey,
      round: otherRound,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const otherPartOf = (kp: Keypair) =>
    PublicKey.findProgramAddressSync(
      [PARTICIPANT_SEED, otherRound.toBuffer(), kp.publicKey.toBuffer()],
      PROGRAM_ID,
    )[0];

  for (const [kp, side] of [
    [outsider, "founder"],
    [outsiderPeer, "builder"],
  ] as const) {
    await programFor(l1, kp)
      .methods.joinRound(
        otherId,
        side === "founder" ? { founder: {} } : { builder: {} },
        "otra-" + side,
        "https://ronda-ciega.vercel.app",
      )
      .accountsPartial({
        wallet: kp.publicKey,
        round: otherRound,
        participant: otherPartOf(kp),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await sleep(700);
  }

  await l1Program.methods
    .delegateRound(otherId)
    .accountsPartial({
      authority: authority.publicKey,
      round: otherRound,
      validator: TEE_VALIDATOR,
    })
    .rpc();

  const [outsiderPrefs] = PublicKey.findProgramAddressSync(
    [PREFERENCES_SEED, otherRound.toBuffer(), outsider.publicKey.toBuffer()],
    PROGRAM_ID,
  );
  await programFor(await teeConnectionFor(outsider), outsider)
    .methods.submitRanking(otherId, Buffer.from([0]))
    .accountsPartial({
      wallet: outsider.publicKey,
      round: otherRound,
      participant: otherPartOf(outsider),
      preferences: outsiderPrefs,
      preferencesPermission: permissionPdaFromAccount(outsiderPrefs),
    })
    .rpc();
  note("una lista real que pertenece a otra ronda");

  const submit = (p: (typeof people)[number], ranking: number[]) =>
    erOf
      .get(p.side + "-" + p.idx)!
      .methods.submitRanking(roundId, Buffer.from(ranking))
      .accountsPartial({
        wallet: p.kp.publicKey,
        round,
        participant: partOf(p.kp),
        preferences: prefsOf(p.kp),
        preferencesPermission: permissionPdaFromAccount(prefsOf(p.kp)),
      })
      .rpc();

  // ==================================================================
  group("submit_ranking — forma de la lista");

  const f0 = people[0];

  await refuses("lista vacía", "InvalidRanking", () => submit(f0, []));

  await refuses(
    "lista más larga que el otro lado (3 para 2 builders)",
    "InvalidRanking",
    () => submit(f0, [0, 1, 1]),
  );

  await refuses("índice fuera de rango", "InvalidRanking", () => submit(f0, [7]));

  await refuses("alguien repetido en la lista", "DuplicateInRanking", () =>
    submit(f0, [0, 0]),
  );

  // ------------------------------------------------------------------
  group("submit_ranking — identidad");

  // The `participant` account is seed-bound to the signing wallet, so Anchor
  // rejects a foreign one before the instruction body runs. That makes the
  // InvalidSession and WrongRound checks inside the body defensive rather than
  // load-bearing — worth pinning, because if the seeds constraint is ever
  // relaxed this test is what says the body is now the only thing holding.
  await refuses(
    "usar la cuenta de participante de otra persona",
    "ConstraintSeeds",
    () =>
      erOf
        .get("founder-0")!
        .methods.submitRanking(roundId, Buffer.from([0]))
        .accountsPartial({
          wallet: f0.kp.publicKey,
          round,
          participant: partOf(people[1].kp),
          preferences: prefsOf(f0.kp),
          preferencesPermission: permissionPdaFromAccount(prefsOf(f0.kp)),
        })
        .rpc(),
  );
  note("InvalidSession y WrongRound quedan tapados por la restricción de semillas");

  // ------------------------------------------------------------------
  group("seal_preferences — antes de tiempo");

  await refuses(
    "sellar con la ronda todavía abierta",
    "WrongRoundStatus",
    () =>
      erAuthorityProgram.methods
        .sealPreferences(roundId)
        .accountsPartial({ round, matchState })
        .remainingAccounts([
          { pubkey: prefsOf(f0.kp), isSigner: false, isWritable: false },
        ])
        .rpc(),
  );

  // ------------------------------------------------------------------
  group("listas válidas");

  const rankings: Record<string, number[]> = {
    "founder-0": [0, 1],
    "founder-1": [0, 1],
    "builder-0": [1, 0],
    "builder-1": [0, 1],
  };
  for (const p of people) {
    await accepts(p.side + "-" + p.idx + " envía su lista", () =>
      submit(p, rankings[p.side + "-" + p.idx]),
    );
  }

  // ==================================================================
  group("esperando la fecha límite");
  while (Math.floor(Date.now() / 1000) < deadline.toNumber()) {
    await sleep(2000);
  }
  await accepts("la ronda cierra", () =>
    erAuthorityProgram.methods.closeRound(roundId).accountsPartial({ round }).rpc(),
  );

  // ------------------------------------------------------------------
  group("seal_preferences — cuentas ajenas y repetidas");

  await refuses(
    "colar una cuenta que no es del programa",
    "InvalidPreferencesAccount",
    () =>
      erAuthorityProgram.methods
        .sealPreferences(roundId)
        .accountsPartial({ round, matchState })
        .remainingAccounts([
          // A plain funded wallet: owned by the System Program, not by us.
          { pubkey: people[0].kp.publicKey, isSigner: false, isWritable: false },
        ])
        .rpc(),
  );

  // A genuine Preferences account, owned by this program, correctly derived —
  // just for a different round. The PDA check would pass; only the explicit
  // `prefs.round == round_key` comparison catches it.
  await refuses(
    "colar una lista real que pertenece a otra ronda",
    "WrongRound",
    () =>
      erAuthorityProgram.methods
        .sealPreferences(roundId)
        .accountsPartial({ round, matchState })
        .remainingAccounts([
          { pubkey: outsiderPrefs, isSigner: false, isWritable: false },
        ])
        .rpc(),
  );

  await accepts("sellar tres de las cuatro listas", () =>
    erAuthorityProgram.methods
      .sealPreferences(roundId)
      .accountsPartial({ round, matchState })
      .remainingAccounts(
        people.slice(0, 3).map((p) => ({
          pubkey: prefsOf(p.kp),
          isSigner: false,
          isWritable: false,
        })),
      )
      .rpc(),
  );

  await refuses("sellar dos veces la misma lista", "AlreadySealed", () =>
    erAuthorityProgram.methods
      .sealPreferences(roundId)
      .accountsPartial({ round, matchState })
      .remainingAccounts([
        { pubkey: prefsOf(people[0].kp), isSigner: false, isWritable: false },
      ])
      .rpc(),
  );

  // ------------------------------------------------------------------
  group("la invariante que reemplaza a SealIncomplete");

  // SealIncomplete is declared in error.rs and never raised. The guard it names
  // is real but expressed as a state transition: the round only becomes
  // Matching once sealed_count reaches ranking_count, and run_matching demands
  // Matching. With three of four lists in, the round must still refuse.
  await refuses(
    "emparejar con una lista sin ingerir",
    "WrongRoundStatus",
    () =>
      erAuthorityProgram.methods
        .runMatching(roundId, 64)
        .accountsPartial({ round, matchState })
        .rpc(),
  );
  note("la ronda sigue en Sealing con 3/4 listas — el estado es la guarda");

  await accepts("sellar la cuarta lista", () =>
    erAuthorityProgram.methods
      .sealPreferences(roundId)
      .accountsPartial({ round, matchState })
      .remainingAccounts([
        { pubkey: prefsOf(people[3].kp), isSigner: false, isWritable: false },
      ])
      .rpc(),
  );

  // ------------------------------------------------------------------
  group("run_matching — ahora sí en estado Matching");

  await refuses("emparejar sin aleatoriedad", "RandomnessMissing", () =>
    erAuthorityProgram.methods
      .runMatching(roundId, 64)
      .accountsPartial({ round, matchState })
      .rpc(),
  );

  await refuses("presupuesto de ticks en cero", "InvalidTickBudget", () =>
    erAuthorityProgram.methods
      .runMatching(roundId, 0)
      .accountsPartial({ round, matchState })
      .rpc(),
  );
  note("el presupuesto se valida antes que la aleatoriedad");

  // ------------------------------------------------------------------
  group("close_preferences — antes de que la ronda cierre");

  await refuses(
    "destruir una lista con la ronda sin liquidar",
    "WrongRoundStatus",
    () =>
      erAuthorityProgram.methods
        .closePreferences(roundId)
        .accountsPartial({
          payer: authority.publicKey,
          owner: people[0].kp.publicKey,
          round,
          preferences: prefsOf(people[0].kp),
          preferencesPermission: permissionPdaFromAccount(prefsOf(people[0].kp)),
        })
        .rpc(),
  );

  // ==================================================================
  group("aleatoriedad");

  await accepts("pedir el VRF", () =>
    erAuthorityProgram.methods
      .requestRoundRandomness(roundId)
      .accountsPartial({ payer: authority.publicKey, round, oracleQueue: EPHEMERAL_QUEUE })
      .rpc(),
  );

  let fulfilled = false;
  for (let i = 0; i < 40; i++) {
    const acc: any = await (erAuthorityProgram.account as any).round.fetch(round);
    if (acc.randomnessFulfilled) {
      fulfilled = true;
      break;
    }
    await sleep(500);
  }
  if (!fulfilled) {
    console.log("  \x1b[31mFAIL\x1b[0m  el VRF nunca llegó");
    failed++;
  } else {
    note("VRF cumplido");
    await refuses("pedir el VRF otra vez", "RandomnessAlreadyFulfilled", () =>
      erAuthorityProgram.methods
        .requestRoundRandomness(roundId)
        .accountsPartial({ payer: authority.publicKey, round, oracleQueue: EPHEMERAL_QUEUE })
        .rpc(),
    );
  }

  // ------------------------------------------------------------------
  group("emparejar y liquidar");

  await accepts("el emparejamiento corre", () =>
    erAuthorityProgram.methods
      .runMatching(roundId, 64)
      .accountsPartial({ round, matchState })
      .rpc(),
  );

  const settled: any = await (erAuthorityProgram.account as any).round.fetch(round);
  note("estado: " + Object.keys(settled.status)[0]);

  // ------------------------------------------------------------------
  group("close_preferences — dueño y repetición");

  await refuses(
    "destruir la lista de alguien declarando otro dueño",
    "ConstraintSeeds",
    () =>
      erAuthorityProgram.methods
        .closePreferences(roundId)
        .accountsPartial({
          payer: authority.publicKey,
          owner: people[1].kp.publicKey,
          round,
          preferences: prefsOf(people[0].kp),
          preferencesPermission: permissionPdaFromAccount(prefsOf(people[0].kp)),
        })
        .rpc(),
  );

  await accepts("destruir la primera lista", () =>
    erAuthorityProgram.methods
      .closePreferences(roundId)
      .accountsPartial({
        payer: authority.publicKey,
        owner: people[0].kp.publicKey,
        round,
        preferences: prefsOf(people[0].kp),
        preferencesPermission: permissionPdaFromAccount(prefsOf(people[0].kp)),
      })
      .rpc(),
  );

  await refuses("destruirla otra vez", "AlreadyClosed", () =>
    erAuthorityProgram.methods
      .closePreferences(roundId)
      .accountsPartial({
        payer: authority.publicKey,
        owner: people[0].kp.publicKey,
        round,
        preferences: prefsOf(people[0].kp),
        preferencesPermission: permissionPdaFromAccount(prefsOf(people[0].kp)),
      })
      .rpc(),
  );

  // ==================================================================
  group("limpieza");

  for (const p of people.slice(1)) {
    try {
      await erAuthorityProgram.methods
        .closePreferences(roundId)
        .accountsPartial({
          payer: authority.publicKey,
          owner: p.kp.publicKey,
          round,
          preferences: prefsOf(p.kp),
          preferencesPermission: permissionPdaFromAccount(prefsOf(p.kp)),
        })
        .rpc();
    } catch {
      /* best effort */
    }
  }
  try {
    await erAuthorityProgram.methods
      .closeMatchState(roundId)
      .accountsPartial({
        payer: authority.publicKey,
        round,
        matchState,
        matchStatePermission: permissionPdaFromAccount(matchState),
      })
      .rpc();
    await erAuthorityProgram.methods
      .undelegateRound(roundId)
      .accountsPartial({ round })
      .rpc();
    note("listas destruidas y ronda devuelta a L1");
  } catch (e: any) {
    note("limpieza incompleta: " + String(e?.message ?? e).slice(0, 90));
  }

  // The second round never settles — it exists only to hold a foreign
  // Preferences account — so bring it back to L1 rather than leaving it
  // delegated and listed on the landing page forever.
  try {
    await programFor(await teeConnectionFor(outsider), outsider)
      .methods.undelegateRound(otherId)
      .accountsPartial({ round: otherRound })
      .rpc();
    note("segunda ronda devuelta a L1");
  } catch {
    note("la segunda ronda sigue delegada (solo está en Open, sin listas vivas en L1)");
  }

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
