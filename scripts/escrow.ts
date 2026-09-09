/**
 * The money path, end to end, against the deployed program.
 *
 * Everything else in this repository proves the matching is private and
 * correct. Nothing proved it can pay anybody. This runs a whole round with
 * funds locked against it — deposits before the deadline, matching inside the
 * enclave, and the payout on L1 afterwards — and then asks the program to
 * refuse the five things that would let somebody take money that is not
 * theirs.
 *
 * The refusals are the point. A settlement that works on the happy path and
 * has never been told "no" is a settlement nobody has tested, and the failure
 * mode is not a broken page, it is a wallet that is short.
 *
 *   npx ts-node scripts/escrow.ts     (~0.35 SOL, ~4 min)
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

/** The IDL the deployed site uses, not the build artefact in target/. */
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
const ESCROW_SEED = Buffer.from("escrow");

/** Two a side is the minimum a round accepts, and enough to leave one out. */
const FOUNDERS = 3;
const BUILDERS = 2;
/** Small enough that a failed run costs nothing, large enough to see move. */
const DEPOSIT = 0.02 * LAMPORTS_PER_SOL;

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

/** Error codes, counted off the IDL rather than written down here. */
const CODE_OF: Record<string, number> = Object.fromEntries(
  (IDL.errors as { code: number; name: string }[]).map((e) => [e.name, e.code]),
);

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

function refusedWith(e: any, name: string): boolean {
  const blob = deepBlob(e);
  const n = CODE_OF[name];
  return (
    blob.includes(name) ||
    (n !== undefined &&
      (blob.includes(String(n)) || blob.includes("0x" + n.toString(16))))
  );
}

async function expectRefusal(
  label: string,
  name: string,
  fn: () => Promise<unknown>,
) {
  try {
    await fn();
    bad(`${label}: se aceptó, debía ser rechazada con ${name}`);
  } catch (e) {
    if (refusedWith(e, name)) ok(`${label} → ${name}`);
    else bad(`${label}: esperaba ${name}, llegó ${deepBlob(e).slice(0, 160)}`);
  }
}

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
  await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
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

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const authority = loadAuthority();
  const l1 = new Connection(DEVNET, "confirmed");
  const l1Program = programFor(l1, authority);

  console.log(`\nprograma  ${PROGRAM_ID.toBase58()}`);
  console.log(`autoridad ${authority.publicKey.toBase58()}`);
  const opening = await l1.getBalance(authority.publicKey);
  console.log(`saldo     ${(opening / LAMPORTS_PER_SOL).toFixed(3)} SOL\n`);

  const roundId = new anchor.BN(Date.now());
  const [round] = PublicKey.findProgramAddressSync(
    [ROUND_SEED, authority.publicKey.toBuffer(), roundId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  );
  const [matchState] = PublicKey.findProgramAddressSync(
    [MATCH_STATE_SEED, round.toBuffer()],
    PROGRAM_ID,
  );
  const escrowOf = (wallet: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [ESCROW_SEED, round.toBuffer(), wallet.toBuffer()],
      PROGRAM_ID,
    )[0];
  const participantOf = (wallet: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [PARTICIPANT_SEED, round.toBuffer(), wallet.toBuffer()],
      PROGRAM_ID,
    )[0];

  // Three founders, two builders: somebody has to go unmatched, which is the
  // only way to exercise a refund on a round that did settle.
  const people = [
    ...Array.from({ length: FOUNDERS }, (_, i) => ({
      side: "founder" as const,
      idx: i,
      kp: Keypair.generate(),
    })),
    ...Array.from({ length: BUILDERS }, (_, i) => ({
      side: "builder" as const,
      idx: i,
      kp: Keypair.generate(),
    })),
  ];

  // ---------------------------------------------------------- preparación
  group("una ronda con tres compradores y dos vendedores");

  const deadline = new anchor.BN(Math.floor(Date.now() / 1000) + 75);
  await l1Program.methods
    .initRound(roundId, deadline, 2, true)
    .accountsPartial({
      authority: authority.publicKey,
      round,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  ok(`ronda abierta ${round.toBase58()}`);

  // Each wallet needs rent for its participant and preferences accounts, the
  // deposit itself, and fees. Funded in one transaction so devnet only has to
  // like us once.
  const perWallet = 0.06 * LAMPORTS_PER_SOL;
  await send(
    l1,
    [authority],
    authority.publicKey,
    ...people.map((p) =>
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: p.kp.publicKey,
        lamports: perWallet + (p.side === "founder" ? DEPOSIT : 0),
      }),
    ),
  );
  ok(`${people.length} billeteras fondeadas`);

  for (const p of people) {
    await programFor(l1, p.kp)
      .methods.joinRound(
        roundId,
        p.side === "founder" ? { founder: {} } : { builder: {} },
        `${p.side}-${p.idx}`,
        "https://build.magicblock.app/builders",
      )
      .accountsPartial({
        wallet: p.kp.publicKey,
        round,
        participant: participantOf(p.kp.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await pause(600);
  }
  ok("todos dentro");

  // ------------------------------------------------------------ depósitos
  group("el dinero entra, y solo por la puerta correcta");

  const founders = people.filter((p) => p.side === "founder");
  for (const p of founders) {
    await programFor(l1, p.kp)
      .methods.depositEscrow(roundId, new anchor.BN(DEPOSIT))
      .accountsPartial({
        wallet: p.kp.publicKey,
        round,
        participant: participantOf(p.kp.publicKey),
        escrow: escrowOf(p.kp.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await pause(500);
  }
  const locked: any = await (l1Program.account as any).escrow.fetch(
    escrowOf(founders[0].kp.publicKey),
  );
  if (locked.amount.toNumber() === DEPOSIT) {
    ok(`${founders.length} depósitos bloqueados, ${DEPOSIT / LAMPORTS_PER_SOL} SOL cada uno`);
  } else {
    bad(`el escrow guarda ${locked.amount.toNumber()}, se depositaron ${DEPOSIT}`);
  }

  const outsider = Keypair.generate();
  await send(l1, [authority], authority.publicKey,
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: outsider.publicKey,
      lamports: 0.03 * LAMPORTS_PER_SOL,
    }),
  );
  await expectRefusal(
    "alguien que no entró a la ronda intentando depositar",
    "AccountNotInitialized",
    () =>
      programFor(l1, outsider)
        .methods.depositEscrow(roundId, new anchor.BN(DEPOSIT))
        .accountsPartial({
          wallet: outsider.publicKey,
          round,
          participant: participantOf(outsider.publicKey),
          escrow: escrowOf(outsider.publicKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
  );

  await expectRefusal("un depósito de cero", "NothingToEscrow", () =>
    programFor(l1, founders[0].kp)
      .methods.depositEscrow(roundId, new anchor.BN(0))
      .accountsPartial({
        wallet: founders[0].kp.publicKey,
        round,
        participant: participantOf(founders[0].kp.publicKey),
        escrow: escrowOf(founders[0].kp.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
  );

  await expectRefusal(
    "cobrar antes de que la ronda cierre",
    "NotSettledYet",
    () =>
      l1Program.methods
        .settlePair(roundId)
        .accountsPartial({
          round,
          payerParticipant: participantOf(founders[0].kp.publicKey),
          payeeParticipant: participantOf(people[FOUNDERS].kp.publicKey),
          escrow: escrowOf(founders[0].kp.publicKey),
          payerWallet: founders[0].kp.publicKey,
          payeeWallet: people[FOUNDERS].kp.publicKey,
        })
        .rpc(),
  );

  await expectRefusal(
    "reembolsarse con la ronda todavía viva",
    "NothingToRefund",
    () =>
      programFor(l1, founders[0].kp)
        .methods.refundEscrow(roundId)
        .accountsPartial({
          wallet: founders[0].kp.publicKey,
          round,
          participant: participantOf(founders[0].kp.publicKey),
          escrow: escrowOf(founders[0].kp.publicKey),
        })
        .rpc(),
  );

  // ------------------------------------------------------- el enclave
  group("el emparejamiento corre donde nadie lo ve");

  await l1Program.methods
    .delegateRound(roundId)
    .accountsPartial({ authority: authority.publicKey, round, validator: TEE_VALIDATOR })
    .rpc();
  const er = await teeConnectionFor(authority);
  const erProgram = programFor(er, authority);

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
    .accountsPartial({ payer: authority.publicKey, round, oracleQueue: EPHEMERAL_QUEUE })
    .rpc();
  ok("delegada, memoria privada creada, VRF pedido");

  // Everyone ranks everyone on the other side, in index order. What matters
  // here is that a pairing comes out, not which one.
  const prefsOf: Record<string, PublicKey> = {};
  for (const p of people) {
    const [prefs] = PublicKey.findProgramAddressSync(
      [PREFERENCES_SEED, round.toBuffer(), p.kp.publicKey.toBuffer()],
      PROGRAM_ID,
    );
    prefsOf[`${p.side}-${p.idx}`] = prefs;
    const n = p.side === "founder" ? BUILDERS : FOUNDERS;
    const erPerson = programFor(await teeConnectionFor(p.kp), p.kp);
    await erPerson.methods
      .submitRanking(roundId, Buffer.from(Array.from({ length: n }, (_, i) => i)))
      .accountsPartial({
        signer: p.kp.publicKey,
        wallet: p.kp.publicKey,
        sessionToken: null,
        round,
        participant: participantOf(p.kp.publicKey),
        preferences: prefs,
        preferencesPermission: permissionPdaFromAccount(prefs),
      })
      .rpc();
    await pause(400);
  }
  ok(`${people.length} listas selladas dentro del enclave`);

  note("esperando la fecha límite…");
  while (Math.floor(Date.now() / 1000) < deadline.toNumber()) await pause(2000);

  await erProgram.methods.closeRound(roundId).accountsPartial({ round }).rpc();
  await erProgram.methods
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
  await erProgram.methods
    .runMatching(roundId, 64)
    .accountsPartial({ round, matchState })
    .rpc();

  const settled: any = await (erProgram.account as any).round.fetch(round);
  const pairs: number[] = Array.from(settled.pairs).slice(0, FOUNDERS) as number[];
  ok(`emparejado: ${pairs.map((b, f) => (b === 255 ? `C${f}:—` : `C${f}→V${b}`)).join("  ")}`);

  await erProgram.methods
    .undelegateRound(roundId)
    .accountsPartial({ payer: authority.publicKey, round })
    .rpc();
  for (let i = 0; i < 30; i++) {
    const info = await l1.getAccountInfo(round);
    if (info && info.owner.equals(PROGRAM_ID)) break;
    await pause(1000);
  }
  ok("la ronda volvió a L1 con los pares");

  // --------------------------------------------------------- liquidación
  group("y entonces el dinero se mueve");

  const matchedIdx = pairs.findIndex((b) => b !== 255);
  const unmatchedIdx = pairs.findIndex((b) => b === 255);
  if (matchedIdx < 0) {
    bad("ningún comprador quedó emparejado: no hay nada que liquidar");
  } else {
    const buyer = founders[matchedIdx];
    const seller = people[FOUNDERS + pairs[matchedIdx]];
    const before = await l1.getBalance(seller.kp.publicKey);

    await l1Program.methods
      .settlePair(roundId)
      .accountsPartial({
        round,
        payerParticipant: participantOf(buyer.kp.publicKey),
        payeeParticipant: participantOf(seller.kp.publicKey),
        escrow: escrowOf(buyer.kp.publicKey),
        payerWallet: buyer.kp.publicKey,
        payeeWallet: seller.kp.publicKey,
      })
      .rpc();

    const after = await l1.getBalance(seller.kp.publicKey);
    if (after - before === DEPOSIT) {
      ok(`el vendedor recibió ${DEPOSIT / LAMPORTS_PER_SOL} SOL, sin firmar nada`);
    } else {
      bad(`el vendedor recibió ${after - before}, se esperaban ${DEPOSIT}`);
    }

    if ((await l1.getAccountInfo(escrowOf(buyer.kp.publicKey))) === null) {
      ok("el escrow se cerró y la renta volvió al comprador");
    } else {
      bad("el escrow sigue abierto después de pagar");
    }

    await expectRefusal("cobrar el mismo par dos veces", "AccountNotInitialized", () =>
      l1Program.methods
        .settlePair(roundId)
        .accountsPartial({
          round,
          payerParticipant: participantOf(buyer.kp.publicKey),
          payeeParticipant: participantOf(seller.kp.publicKey),
          escrow: escrowOf(buyer.kp.publicKey),
          payerWallet: buyer.kp.publicKey,
          payeeWallet: seller.kp.publicKey,
        })
        .rpc(),
    );

    // The attack the whole design exists to refuse: real accounts, real
    // round, real escrow — and a recipient the matching never chose.
    const otherSeller = people.find(
      (p) => p.side === "builder" && p.kp.publicKey !== seller.kp.publicKey,
    );
    const stillFunded = founders.find(
      (f, i) => i !== matchedIdx && pairs[i] !== 255,
    );
    if (otherSeller && stillFunded) {
      await expectRefusal(
        "pagarle a un vendedor que el emparejamiento no eligió",
        "NotYourPair",
        () =>
          l1Program.methods
            .settlePair(roundId)
            .accountsPartial({
              round,
              payerParticipant: participantOf(stillFunded.kp.publicKey),
              payeeParticipant: participantOf(otherSeller.kp.publicKey),
              escrow: escrowOf(stillFunded.kp.publicKey),
              payerWallet: stillFunded.kp.publicKey,
              payeeWallet: otherSeller.kp.publicKey,
            })
            .rpc(),
      );
    } else {
      note("no quedó un segundo par financiado para probar el pago cruzado");
    }
  }

  // ------------------------------------------------------------ reembolso
  group("y a quien no le tocó, le vuelve");

  if (unmatchedIdx < 0) {
    note("todos quedaron emparejados: no hay reembolso que probar");
  } else {
    const left = founders[unmatchedIdx];
    const before = await l1.getBalance(left.kp.publicKey);
    await programFor(l1, left.kp)
      .methods.refundEscrow(roundId)
      .accountsPartial({
        wallet: left.kp.publicKey,
        round,
        participant: participantOf(left.kp.publicKey),
        escrow: escrowOf(left.kp.publicKey),
      })
      .rpc();
    const after = await l1.getBalance(left.kp.publicKey);
    if (after > before) {
      ok(`el comprador sin par recuperó ${((after - before) / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    } else {
      bad(`el reembolso no devolvió nada: ${before} → ${after}`);
    }
  }

  // ------------------------------------------------------------- resumen
  const spent = (opening - (await l1.getBalance(authority.publicKey))) / LAMPORTS_PER_SOL;
  console.log(
    `\n\x1b[1m${passed} pasaron, ${failed} fallaron\x1b[0m  ·  ${spent.toFixed(3)} SOL gastados`,
  );
  console.log(`ronda: ${round.toBase58()}\n`);
  if (failed) {
    for (const f of failures) console.log("  · " + f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("\n" + deepBlob(e).slice(0, 900) + "\n");
  process.exit(1);
});
