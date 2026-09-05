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
 */
const cache = new Map<string, { conn: Connection; expiresAt: number }>();

export async function teeConnection(
  wallet: PublicKey,
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>,
): Promise<Connection> {
  const key = wallet.toBase58();
  const hit = cache.get(key);
  // Re-auth a minute early rather than let a request fail mid-flow.
  if (hit && hit.expiresAt - 60_000 > Date.now()) return hit.conn;

  const { token, expiresAt } = await getAuthToken(TEE_RPC, wallet, signMessage);
  const conn = new Connection(`${TEE_RPC}?token=${token}`, "confirmed");
  cache.set(key, { conn, expiresAt: expiresAt * 1000 });
  return conn;
}

/** Unauthenticated view of the rollup: public accounts only. */
export function publicTeeConnection(): Connection {
  return new Connection(TEE_RPC, "confirmed");
}
