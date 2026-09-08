/**
 * The session-key path, end to end, against the deployed program.
 *
 * Every other suite submits a ranking the way the program worked before:
 * the owner signs, `session_token` is null, and the check that the signer IS
 * the owner passes trivially. Nothing had ever exercised an actual token —
 * which is the path a person now takes on the site, and the one being
 * recorded. A feature nobody has run is a feature nobody knows about.
 *
 * So this does what the browser does. It authorises a fresh key against the
 * session-keys program on L1, submits a ranking signed by that key with the
 * token attached, and confirms the list landed. Then it asks the program to
 * refuse the things it must refuse: a token belonging to somebody else, a
 * signer who is not the one the token names, and a signer with no token at
 * all pretending to be an owner.
 *
 *   npx ts-node scripts/session.ts     (~0.1 SOL, ~2 min)
 */
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
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
const PROGRAM_ID = new PublicKey(IDL.address);
const SESSION_PROGRAM = new PublicKey(
  "KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5",
);
const CREATE_SESSION_IX = Buffer.from([242, 193, 143, 179, 150, 25, 122, 227]);

const ROUND_SEED = Buffer.from("round");
const PARTICIPANT_SEED = Buffer.from("participant");
const PREFERENCES_SEED = Buffer.from("preferences");
const SESSION_TOKEN_SEED = Buffer.from("session_token");

let passed = 0;
let failed = 0;
const failures: string[] = [];

const group = (t: string) => console.log("\n\x1b[1m" + t + "\x1b[0m");
const note = (m: string) => console.log("        \x1b[2m" + m + "\x1b[0m");
const ok = (m: string) => {
  passed++;
  console.log("  \x1b[32mok\x1b[0m    " + m);
};
const bad = (m: string) => {
  failed++;
  failures.push(m);
  console.log("  \x1b[31mFAIL\x1b[0m  " + m);
};

const CODE_OF: Record<string, number> = { InvalidSession: 6012 };

/** Everything the error knows, flattened — the TEE returns no logs. */
function deepBlob(e: any, depth = 0): string {
  if (e === null || e === undefined || depth > 4) return "";
  if (typeof e !== "object") return String(e);
  const parts: string[] = [];
  for (const k of Object.getOwnPropertyNames(e)) {
    if (k === "stack") continue;
    try {
      parts.push(k + "=" + deepBlob((e as any)[k], depth + 1));
    } catch {
      /* getters that throw */
    }
  }
  return parts.join(" ");
}

/** Did this failure carry the program error we were expecting? */
function refusedWith(e: any, name: keyof typeof CODE_OF): boolean {
  const blob = deepBlob(e);
  const n = CODE_OF[name];
  return (
    blob.includes(name) ||
    blob.includes(String(n)) ||
    blob.includes("0x" + n.toString(16))
  );
}

async function expectRefusal(
  label: string,
  name: keyof typeof CODE_OF,
  fn: () => Promise<unknown>,
) {
  try {
    await fn();
    bad(`${label}: se aceptó, debía ser rechazada con ${name}`);
  } catch (e) {
    if (refusedWith(e, name)) ok(`${label} → ${name}`);
    else bad(`${label}: esperaba ${name}, llegó ${deepBlob(e).slice(0, 140)}`);
  }
}

/**
 * One transaction, with a blockhash fetched at send time and waited on.
 *
 * The first version built raw Transactions and let sendTransaction find its
 * own blockhash, which is fine until devnet hands back one that has already
 * moved on — "Blockhash not found" mid-suite, on a funding transfer, with
 * nothing wrong with the thing being tested. Fetching immediately before and
 * confirming after costs a second and removes the whole class.
 */
async function send(
  connection: Connection,
  signers: Keypair[],
  feePayer: PublicKey,
  ...ixs: TransactionInstruction[]
): Promise<string> {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = feePayer;
  const bh = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = bh.blockhash;
  const sig = await connection.sendTransaction(tx, signers, {
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(
    { signature: sig, ...bh },
    "confirmed",
  );
  return sig;
}

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

async function teeConnectionFor(kp: Keypair): Promise<Connection> {
  const { token } = await getAuthToken(TEE_RPC, kp.publicKey, async (msg) =>
    nacl.sign.detached(msg, kp.secretKey),
  );
  return new Connection(`${TEE_RPC}?token=${token}`, "confirmed");
}

const sessionTokenPda = (signer: PublicKey, authority: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [SESSION_TOKEN_SEED, PROGRAM_ID.toBuffer(), signer.toBuffer(), authority.toBuffer()],
    SESSION_PROGRAM,
  )[0];

/** Borsh `Option<T>`: a tag byte, then the value. */
const option = (v: Buffer | null) =>
  v === null ? Buffer.from([0]) : Buffer.concat([Buffer.from([1]), v]);

const i64 = (n: number) => {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(n));
  return b;
};

function createSessionIx(
  authority: PublicKey,
  signer: PublicKey,
  validUntil: number,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: SESSION_PROGRAM,
    keys: [
      { pubkey: sessionTokenPda(signer, authority), isSigner: false, isWritable: true },
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      CREATE_SESSION_IX,
      option(null),
      option(i64(validUntil)),
      option(null),
    ]),
  });
}

async function main() {
  const authority = loadAuthority();
  const l1 = new Connection(DEVNET, "confirmed");

  console.log(`\nprograma  ${PROGRAM_ID.toBase58()}`);
  console.log(`autoridad ${authority.publicKey.toBase58()}`);
  console.log(
    `saldo     ${((await l1.getBalance(authority.publicKey)) / LAMPORTS_PER_SOL).toFixed(3)} SOL`,
  );

  // ------------------------------------------------------------ una ronda
  group("una ronda con dos personas por lado");

  const roundId = new anchor.BN(Date.now());
  const [round] = PublicKey.findProgramAddressSync(
    [ROUND_SEED, authority.publicKey.toBuffer(), roundId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  );

  const l1Program = programFor(l1, authority);
  await l1Program.methods
    .initRound(roundId, new anchor.BN(Math.floor(Date.now() / 1000) + 600), 2, true)
    .accountsPartial({
      authority: authority.publicKey,
      round,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  ok(`ronda abierta ${round.toBase58()}`);

  const people = [
    { side: "founder", idx: 0, kp: Keypair.generate() },
    { side: "founder", idx: 1, kp: Keypair.generate() },
    { side: "builder", idx: 0, kp: Keypair.generate() },
    { side: "builder", idx: 1, kp: Keypair.generate() },
  ];

  await send(
    l1,
    [authority],
    authority.publicKey,
    ...people.map((p) =>
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: p.kp.publicKey,
        lamports: Math.round(0.02 * LAMPORTS_PER_SOL),
      }),
    ),
  );
  ok("cuatro monederos fondeados");

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

  for (const p of people) {
    await programFor(l1, p.kp)
      .methods.joinRound(
        roundId,
        p.side === "founder" ? { founder: {} } : { builder: {} },
        `${p.side}-${p.idx}`,
        "https://ronda-ciega.vercel.app",
      )
      .accountsPartial({
        wallet: p.kp.publicKey,
        round,
        participant: partOf(p.kp),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }
  ok("los cuatro entraron");

  await l1Program.methods
    .delegateRound(roundId)
    .accountsPartial({ authority: authority.publicKey, round, validator: TEE_VALIDATOR })
    .rpc();
  await new Promise((r) => setTimeout(r, 5000));
  ok("ronda delegada al rollup");

  // ------------------------------------------------ el camino que importa
  group("una clave de sesión escribe una lista");

  const owner = people[0];
  const session = Keypair.generate();
  const token = sessionTokenPda(session.publicKey, owner.kp.publicKey);
  const validUntil = Math.floor(Date.now() / 1000) + 2 * 3600;

  await send(
    l1,
    [owner.kp, session],
    owner.kp.publicKey,
    createSessionIx(owner.kp.publicKey, session.publicKey, validUntil),
    SystemProgram.transfer({
      fromPubkey: owner.kp.publicKey,
      toPubkey: session.publicKey,
      lamports: Math.round(0.01 * LAMPORTS_PER_SOL),
    }),
  );

  if (await l1.getAccountInfo(token)) ok("token de sesión creado en L1");
  else bad("el token de sesión no existe tras autorizarlo");

  // The enclave still learns who you are from the OWNER's signature. The
  // session key signs the transaction; it never stands in for identity.
  const ownerTee = await teeConnectionFor(owner.kp);
  const sessionProgram = programFor(ownerTee, session);

  const submitAs = (
    signer: Keypair,
    walletKey: PublicKey,
    tokenAccount: PublicKey | null,
    conn: Connection,
    ranking: number[],
  ) =>
    programFor(conn, signer)
      .methods.submitRanking(roundId, Buffer.from(ranking))
      .accountsPartial({
        signer: signer.publicKey,
        wallet: walletKey,
        sessionToken: tokenAccount,
        round,
        participant: PublicKey.findProgramAddressSync(
          [PARTICIPANT_SEED, round.toBuffer(), walletKey.toBuffer()],
          PROGRAM_ID,
        )[0],
        preferences: PublicKey.findProgramAddressSync(
          [PREFERENCES_SEED, round.toBuffer(), walletKey.toBuffer()],
          PROGRAM_ID,
        )[0],
        preferencesPermission: permissionPdaFromAccount(
          PublicKey.findProgramAddressSync(
            [PREFERENCES_SEED, round.toBuffer(), walletKey.toBuffer()],
            PROGRAM_ID,
          )[0],
        ),
      })
      .rpc();

  try {
    await submitAs(session, owner.kp.publicKey, token, ownerTee, [0, 1]);
    ok("la clave de sesión envió la lista del dueño, sin que el dueño firme la transacción");
  } catch (e) {
    bad("la clave de sesión no pudo enviar: " + deepBlob(e).slice(0, 160));
  }

  const written = await ownerTee.getAccountInfo(prefsOf(owner.kp));
  if (written) ok(`la lista existe en el rollup (${written.data.length} bytes)`);
  else bad("la lista no quedó escrita");

  // ------------------------------------------------------ lo que rechaza
  group("lo que el programa tiene que rechazar");

  const stranger = Keypair.generate();
  await send(l1, [authority], authority.publicKey,
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: stranger.publicKey,
      lamports: Math.round(0.02 * LAMPORTS_PER_SOL),
    }),
  );

  const strangerTee = await teeConnectionFor(people[1].kp);

  await expectRefusal(
    "una clave sin token intentando escribir la lista de otro",
    "InvalidSession",
    () => submitAs(stranger, people[1].kp.publicKey, null, strangerTee, [0]),
  );

  await expectRefusal(
    "una clave usando el token de OTRO dueño",
    "InvalidSession",
    () => submitAs(session, people[1].kp.publicKey, token, strangerTee, [0]),
  );

  await expectRefusal(
    "un firmante que el token no nombra",
    "InvalidSession",
    () => submitAs(stranger, owner.kp.publicKey, token, ownerTee, [1, 0]),
  );

  // ------------------------------------------------------------ el dueño
  group("y el camino de siempre sigue abierto");

  try {
    await submitAs(people[1].kp, people[1].kp.publicKey, null, strangerTee, [1, 0]);
    ok("el dueño firmando por sí mismo, sin token");
  } catch (e) {
    bad("el dueño no pudo enviar sin token: " + deepBlob(e).slice(0, 160));
  }

  console.log(
    `\n\x1b[1m${passed} pasaron, ${failed} fallaron\x1b[0m`,
  );
  if (failures.length) {
    console.log("\nfallas:");
    for (const f of failures) console.log("  · " + f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("\n\x1b[31msession failed:\x1b[0m", e);
  process.exit(1);
});
