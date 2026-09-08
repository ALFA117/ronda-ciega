import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import { PROGRAM_ID } from "./constants";

/** The session-keys program, live on devnet. */
export const SESSION_PROGRAM = new PublicKey(
  "KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5",
);

/**
 * `sha256("global:create_session")[0..8]`.
 *
 * Hardcoded rather than derived at runtime: the digest is a constant, and
 * computing it would make this module async for no reason. It is the one
 * thing here that would break silently if the session-keys program renamed
 * the instruction, so it is written out where that is obvious.
 */
const CREATE_SESSION_IX = Buffer.from([242, 193, 143, 179, 150, 25, 122, 227]);

/** Enough for the rollup fees one round of ranking costs. */
export const SESSION_FUNDING_SOL = 0.01;

/** How long a session lasts before the wallet has to authorise a new one. */
export const SESSION_HOURS = 2;

const STORAGE_PREFIX = "rc-session-key:";

/**
 * The two methods of `localStorage` this module uses, and nothing else.
 *
 * A bare reference to a global that does not exist throws a ReferenceError
 * rather than reading as `undefined`, and this file is imported by a
 * server-rendered page and by the test runner, neither of which has a
 * `localStorage` at all. Going through `globalThis` turns that absence into a
 * value the code can check — and, not incidentally, lets the tests typecheck
 * against a config with no DOM library, which is what keeps browser
 * assumptions from drifting into lib/ unnoticed.
 */
type Slot = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function storage(): Slot | null {
  return (globalThis as { localStorage?: Slot }).localStorage ?? null;
}

export interface SessionKey {
  keypair: Keypair;
  publicKey: PublicKey;
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>;
  signTransaction: <T extends { partialSign: (kp: Keypair) => void }>(tx: T) => Promise<T>;
  signAllTransactions: <T extends { partialSign: (kp: Keypair) => void }>(txs: T[]) => Promise<T[]>;
}

/**
 * The key that signs rankings on the rollup, in place of the wallet.
 *
 * Kept per wallet, because the session token on chain names both — a key
 * shared between two wallets would carry a token that authorises it for only
 * one of them, and fail confusingly for the other.
 *
 * It is a hot key in localStorage, and it is worth being precise about what
 * that risks. Within its two hours it can submit a ranking as you. It cannot
 * read one: every account is seeded from your wallet, and the permission on a
 * Preferences account names the owner and the round, never the signer. It
 * cannot move funds, join rounds, or touch anything but this program, because
 * the token names the program too.
 */
export function sessionKey(wallet: PublicKey): SessionKey {
  const slot = STORAGE_PREFIX + wallet.toBase58();
  let keypair: Keypair | null = null;

  const store = storage();

  try {
    const stored = store?.getItem(slot);
    if (stored) {
      const bytes = Uint8Array.from(JSON.parse(stored));
      if (bytes.length === 64) keypair = Keypair.fromSecretKey(bytes);
    }
  } catch {
    /* blocked storage, or a value from another shape */
  }

  if (!keypair) {
    keypair = Keypair.generate();
    try {
      store?.setItem(slot, JSON.stringify(Array.from(keypair.secretKey)));
    } catch {
      /* not persisted; the next load authorises a new one */
    }
  }

  const kp = keypair;
  return {
    keypair: kp,
    publicKey: kp.publicKey,
    signMessage: async (msg) => nacl.sign.detached(msg, kp.secretKey),
    signTransaction: async (tx) => {
      tx.partialSign(kp);
      return tx;
    },
    signAllTransactions: async (txs) => {
      for (const tx of txs) tx.partialSign(kp);
      return txs;
    },
  };
}

/** Where the token for this pair lives. Deterministic, so it can be looked up. */
export function sessionTokenPda(
  sessionSigner: PublicKey,
  authority: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("session_token"),
      PROGRAM_ID.toBuffer(),
      sessionSigner.toBuffer(),
      authority.toBuffer(),
    ],
    SESSION_PROGRAM,
  )[0];
}

/** Borsh `Option<T>`: a tag byte, then the value only when there is one. */
function option(value: Buffer | null): Buffer {
  return value ? Buffer.concat([Buffer.from([1]), value]) : Buffer.from([0]);
}

function i64(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(Math.trunc(n)));
  return b;
}

/**
 * Authorise a session key to act for this wallet on this program.
 *
 * An ordinary L1 transaction to a program that exists there, which is exactly
 * what a wallet can simulate — so this is the one signature the whole flow
 * still costs, and the one that will not be refused.
 */
export function createSessionIx(
  authority: PublicKey,
  sessionSigner: PublicKey,
  validUntil: number,
): TransactionInstruction {
  const data = Buffer.concat([
    CREATE_SESSION_IX,
    option(null), // top_up: let the program decide
    option(i64(validUntil)),
    option(null), // lamports: no top-up requested
  ]);

  return new TransactionInstruction({
    programId: SESSION_PROGRAM,
    keys: [
      { pubkey: sessionTokenPda(sessionSigner, authority), isSigner: false, isWritable: true },
      { pubkey: sessionSigner, isSigner: true, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** Seconds since the epoch, `SESSION_HOURS` from now. */
export function sessionExpiry(): number {
  return Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;
}

/**
 * A SessionToken is 8 bytes of discriminator, three pubkeys, then `valid_until`.
 *
 * Reading another program's account layout by hand is normally a bad trade,
 * and the first version of this file refused to do it. What changes the trade
 * is that the layout is not another program's secret here: `submit_ranking`
 * takes an `Account<'info, SessionToken>`, so the struct is declared in our
 * own IDL, and a change to it would stop the program compiling long before it
 * could mislead anyone reading these eight bytes.
 */
const VALID_UNTIL_AT = 8 + 32 * 3;
const SESSION_TOKEN_LEN = VALID_UNTIL_AT + 8;

/** Unix seconds at which the token stops working, or `null` if this is not one. */
export function readValidUntil(data: Uint8Array): number | null {
  if (data.length !== SESSION_TOKEN_LEN) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return Number(view.getBigInt64(VALID_UNTIL_AT, true));
}

/** What this browser's session key is worth right now. */
export type SessionState = "none" | "expired" | "live";

/**
 * How close to `valid_until` counts as expired already.
 *
 * The program compares against the cluster's clock and this compares against
 * the browser's, and the gap between them is only ever a few seconds. But a
 * token with four seconds left is not worth promising: by the time the
 * transaction lands it is gone, and the person was told the action was free.
 * The enclave cache next to this one uses the same minute for the same
 * reason.
 */
const SKEW_SECONDS = 60;

/**
 * Is this browser's session key authorised on chain, and still good?
 *
 * The interface promises a number of wallet prompts before it costs them, and
 * that number depends on two caches rather than one: the enclave token in
 * localStorage, and this account on L1. Getting it wrong in the cheap
 * direction is the bad one — telling somebody an action is free and then
 * opening their wallet is worse than not having claimed anything.
 *
 * Which is why this reads `valid_until` rather than stopping at "the account
 * exists". A token expires after a couple of hours and its account stays
 * behind, so existence alone answers "free" to exactly the person who came
 * back tomorrow — the case the promise was written for. Everything this
 * cannot read confidently is reported as a cost instead: an RPC that will not
 * answer, an account of an unexpected length, storage that will not open.
 * Those all over-count the prompts, which is the direction that keeps it.
 */
export async function sessionState(
  connection: {
    getAccountInfo(a: PublicKey): Promise<{ data: Uint8Array } | null>;
  },
  wallet: PublicKey,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<SessionState> {
  try {
    const token = sessionTokenPda(sessionKey(wallet).publicKey, wallet);
    const info = await connection.getAccountInfo(token);
    if (!info) return "none";
    const until = readValidUntil(info.data);
    if (until === null) return "expired";
    return until - SKEW_SECONDS > nowSeconds ? "live" : "expired";
  } catch {
    return "none";
  }
}
