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

  try {
    const stored = localStorage.getItem(slot);
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
      localStorage.setItem(slot, JSON.stringify(Array.from(keypair.secretKey)));
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
 * Is this browser's session key already authorised on chain?
 *
 * The interface promises a number of wallet prompts before it costs them, and
 * that number now depends on two caches rather than one: the enclave token in
 * localStorage, and this account on L1. Getting it wrong in the cheap
 * direction is the bad one — telling somebody an action is free and then
 * opening their wallet is worse than not having claimed anything.
 *
 * Existence, not validity. A token that has expired still exists, and reading
 * `valid_until` means parsing an account laid out by someone else's program;
 * the honest fallback is that the program refuses an expired token by name and
 * the caller starts a fresh session. So this answers "has one been made", and
 * the refusal answers "is it still good".
 */
export async function hasSessionToken(
  connection: { getAccountInfo(a: PublicKey): Promise<unknown | null> },
  wallet: PublicKey,
): Promise<boolean> {
  try {
    const token = sessionTokenPda(sessionKey(wallet).publicKey, wallet);
    return (await connection.getAccountInfo(token)) !== null;
  } catch {
    // An RPC that will not answer is not evidence of anything. Say no, which
    // over-counts the prompts rather than under-counting them.
    return false;
  }
}
