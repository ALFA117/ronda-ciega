import { PROGRAM_ID } from "./constants";

/**
 * Account sizes, as the program declares them.
 *
 * These are the sizes an account of each kind occupies on chain: eight bytes
 * of Anchor discriminator plus the struct's own LEN from
 * programs/ronda-ciega/src/state.rs. They are duplicated here because the only
 * way to ask "how many preference lists are on L1" over a public RPC is to
 * filter by size — so if the Rust changes and this does not, the question
 * silently becomes a different question and the answer stays reassuring.
 *
 * `scripts/verify.mjs` recomputes them from state.rs on every CI run for
 * exactly that reason.
 */
export const ACCOUNT_SIZE = {
  /** 32 + 32 + 1 + 1 + 1 + MAX_PER_SIDE + 1, plus the discriminator. */
  preferences: 8 + (32 + 32 + 1 + 1 + 1 + 16 + 1),
  /** 32 + 32 + 1 + 1 + (4 + 32) + (4 + 96) + 1, plus the discriminator. */
  participant: 8 + (32 + 32 + 1 + 1 + (4 + 32) + (4 + 96) + 1),
} as const;

/**
 * The RPC call, spelled out so a reader can run it themselves.
 *
 * `dataSlice` of length zero asks for the addresses without the contents:
 * the count is the whole answer, and a page that downloaded every account to
 * count them would be doing something else.
 */
export function countAccountsBody(size: number) {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "getProgramAccounts",
    params: [
      PROGRAM_ID.toBase58(),
      {
        encoding: "base64",
        dataSlice: { offset: 0, length: 0 },
        filters: [{ dataSize: size }],
      },
    ],
  };
}

/** The same call as a shell command, for someone who would rather not trust a page. */
export function curlFor(rpc: string, size: number): string {
  return `curl -s ${rpc} -X POST -H 'content-type: application/json' \\
  -d '${JSON.stringify(countAccountsBody(size))}' | jq '.result | length'`;
}

export async function countAccounts(rpc: string, size: number): Promise<number> {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(countAccountsBody(size)),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return json.result.length as number;
}
