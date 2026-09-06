/**
 * Turn a wallet or RPC failure into something a person can act on.
 *
 * The failure that actually happens to first-time users is not in this
 * program at all: their wallet is pointed at Mainnet, simulates a transaction
 * against a cluster where this program does not exist, and reports "reverted
 * during simulation — an unknown error occurred". Nothing about that says
 * "switch your network", which is the only thing to do about it.
 */
export type Reason =
  | "rejected"
  | "wrongNetwork"
  | "lowBalance"
  | "blockhash"
  | "unknown";

/** Classify without guessing: each pattern is one a wallet really emits. */
export function classifyError(e: unknown): Reason {
  const text = [
    (e as any)?.message,
    (e as any)?.name,
    (e as any)?.error?.message,
    String(e ?? ""),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    text.includes("user rejected") ||
    text.includes("rejected the request") ||
    text.includes("user denied") ||
    text.includes("walletsigntransactionerror")
  ) {
    return "rejected";
  }

  // Not enough lamports to pay rent or fees.
  if (
    text.includes("insufficient lamports") ||
    text.includes("insufficient funds") ||
    text.includes("attempt to debit an account")
  ) {
    return "lowBalance";
  }

  // A program that is not there, or an account the cluster has never seen:
  // what a devnet transaction looks like when the wallet is on mainnet.
  if (
    text.includes("reverted during simulation") ||
    text.includes("program that does not exist") ||
    text.includes("programaccountnotfound") ||
    text.includes("invalid account owner") ||
    text.includes("unknown error occurred")
  ) {
    return "wrongNetwork";
  }

  if (text.includes("blockhash not found") || text.includes("block height exceeded")) {
    return "blockhash";
  }

  return "unknown";
}
