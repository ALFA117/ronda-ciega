import { Connection, PublicKey } from "@solana/web3.js";
import { getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";
import { TEE_RPC } from "./constants";

/**
 * The TEE only answers for a wallet that signed its auth challenge, and the
 * token is what decides which shielded accounts that connection may read.
 *
 * The signature prompt this triggers is worth explaining in the UI rather than
 * hiding: it is the moment the user proves to the enclave who they are, and it
 * is the reason nobody else can read their ranking.
 *
 * It is also the prompt people complain about, because it used to fire far
 * more often than the enclave requires. The cache was a module-level Map, so
 * every page reload — every navigation from the round list into a round, on a
 * hard load — threw the token away and signed again for a credential that was
 * still valid for hours. The token is now persisted per wallet, so the prompt
 * happens once per expiry window instead of once per page view.
 *
 * On what is being stored: this is a bearer token for one wallet's *read*
 * access to its own shielded accounts, it expires on its own, and localStorage
 * is same-origin. It authorises nothing on L1 and cannot move a lamport. An
 * attacker who can read this origin's localStorage can already prompt the
 * wallet directly, which is strictly worse.
 */

const KEY = "rc.tee.v1";
/** Re-auth a minute early rather than let a request fail mid-flow. */
const SKEW_MS = 60_000;

type Stored = Record<string, { token: string; expiresAt: number }>;

/** Live connections, so repeat calls in one session reuse the same object. */
const live = new Map<string, { conn: Connection; expiresAt: number }>();

function readStore(): Stored {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Anything unexpected in storage is discarded rather than trusted: this
    // value ends up in a URL, so a non-string token must never get that far.
    if (!parsed || typeof parsed !== "object") return {};
    const out: Stored = {};
    for (const [k, v] of Object.entries(parsed as Stored)) {
      if (v && typeof v.token === "string" && typeof v.expiresAt === "number") {
        out[k] = { token: v.token, expiresAt: v.expiresAt };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(store: Stored) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Private mode, quota, a browser blocking site data: the token simply
    // stops surviving reloads. The flow still works, it just re-prompts.
  }
}

function fresh(expiresAt: number) {
  return expiresAt - SKEW_MS > Date.now();
}

/**
 * True when the next enclave call will go through without a signature prompt.
 * The UI uses this to promise a prompt only when one is actually coming.
 */
export function hasTeeSession(wallet: PublicKey | null): boolean {
  if (!wallet) return false;
  const key = wallet.toBase58();
  const hit = live.get(key);
  if (hit && fresh(hit.expiresAt)) return true;
  const stored = readStore()[key];
  return !!stored && fresh(stored.expiresAt);
}

export async function teeConnection(
  wallet: PublicKey,
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>,
): Promise<Connection> {
  const key = wallet.toBase58();

  const hit = live.get(key);
  if (hit && fresh(hit.expiresAt)) return hit.conn;

  const store = readStore();
  const saved = store[key];
  if (saved && fresh(saved.expiresAt)) {
    const conn = new Connection(`${TEE_RPC}?token=${saved.token}`, "confirmed");
    live.set(key, { conn, expiresAt: saved.expiresAt });
    return conn;
  }

  const { token, expiresAt } = await getAuthToken(TEE_RPC, wallet, signMessage);
  const ms = expiresAt * 1000;
  const conn = new Connection(`${TEE_RPC}?token=${token}`, "confirmed");
  live.set(key, { conn, expiresAt: ms });
  // Drop everyone else's expired entries while we are here, so a shared
  // browser does not accumulate dead tokens forever.
  const next: Stored = { [key]: { token, expiresAt: ms } };
  for (const [k, v] of Object.entries(store)) {
    if (k !== key && fresh(v.expiresAt)) next[k] = v;
  }
  writeStore(next);
  return conn;
}

/** Forget a wallet's enclave session — used when the wallet disconnects. */
export function clearTeeSession(wallet?: PublicKey) {
  if (wallet) {
    const key = wallet.toBase58();
    live.delete(key);
    const store = readStore();
    delete store[key];
    writeStore(store);
    return;
  }
  live.clear();
  writeStore({});
}

/** Unauthenticated view of the rollup: public accounts only. */
export function publicTeeConnection(): Connection {
  return new Connection(TEE_RPC, "confirmed");
}
