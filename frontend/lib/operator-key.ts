import { Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";

const STORAGE_KEY = "rc-operator-key";

/**
 * A local key that runs the round, so the operator is not asked to sign
 * rollup transactions their wallet cannot make sense of.
 *
 * A wallet simulates every transaction against L1. Once a round is delegated
 * its account no longer lives there, so the simulation fails and the wallet
 * either warns loudly or refuses outright — on its own dApp, for a
 * transaction that would have succeeded. That is not a bug to fix in the
 * page; it is what an ephemeral rollup looks like from a wallet's side.
 *
 * None of the instructions this key sends check WHO signed. `close_round`,
 * `seal_preferences` and `tick` take no signer at all, and the rest take a
 * `payer` that is never compared against the round's authority. So the only
 * thing a signature buys there is paying the fee, and a key in this browser
 * can do that without a prompt.
 *
 * What it deliberately cannot do is submit a ranking. That instruction is
 * bound to the participant's own wallet, and it stays that way: identity is
 * the one thing that must not move to a key sitting in localStorage.
 */
export interface OperatorKey {
  keypair: Keypair;
  publicKey: PublicKey;
  /** Shaped for Anchor's provider, which wants a wallet-like object. */
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>;
}

function wrap(keypair: Keypair): OperatorKey {
  return {
    keypair,
    publicKey: keypair.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => {
      if (tx instanceof VersionedTransaction) tx.sign([keypair]);
      else tx.partialSign(keypair);
      return tx;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => {
      for (const tx of txs) {
        if (tx instanceof VersionedTransaction) tx.sign([keypair]);
        else tx.partialSign(keypair);
      }
      return txs;
    },
    signMessage: async (msg: Uint8Array) =>
      nacl.sign.detached(msg, keypair.secretKey),
  };
}

/**
 * The same key across reloads, so the small balance it is given is not
 * stranded on a key the next page load has forgotten. Storage can be
 * unavailable or hold something unusable, and both cases end the same way:
 * a fresh key rather than an exception.
 */
export function operatorKey(): OperatorKey {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const bytes = Uint8Array.from(JSON.parse(stored));
      if (bytes.length === 64) return wrap(Keypair.fromSecretKey(bytes));
    }
  } catch {
    /* private mode, cleared storage, or a value from another shape */
  }

  const keypair = Keypair.generate();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(keypair.secretKey)));
  } catch {
    // Not persisted; it still works for this page, and the next load will
    // make another one. Worth no more than that: it holds test SOL.
  }
  return wrap(keypair);
}

/** Enough for the dozen rollup transactions a round costs, and no more. */
export const OPERATOR_TOPUP_SOL = 0.02;
/** Below this the next sequence is likely to run out partway through. */
export const OPERATOR_MIN_SOL = 0.004;
