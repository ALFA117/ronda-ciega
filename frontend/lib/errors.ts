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
  | "roundClosed"
  | "alreadyDone"
  | "notEnough"
  | "tooEarly"
  | "sideFull"
  | "badRanking"
  | "noRandomness"
  | "deadlinePast"
  | "profileTooLong"
  | "wrongRound"
  | "sealIncomplete"
  | "badSession"
  | "badPreferences"
  | "randomnessDone"
  | "badTickBudget"
  | "overflow"
  | "unknown";

/**
 * Program errors, by the number Anchor assigns them from 6000 in declaration
 * order in programs/ronda-ciega/src/error.rs.
 *
 * The number matters more than the name here. A transaction that touches a
 * private account gets no logs back from the TEE and arrives with an empty
 * message, so the usual `error.errorCode.code` is absent and every rollup
 * failure would otherwise be classified as "unknown" — which is how a person
 * sealing a list came to be told the round could not be created.
 */
const PROGRAM_ERRORS: Record<number, Reason> = {
  6000: "deadlinePast", // DeadlineInPast
  6001: "roundClosed", // RoundClosed
  6002: "tooEarly", // RoundStillOpen
  6003: "roundClosed", // WrongRoundStatus
  6004: "sideFull", // SideFull
  6005: "notEnough", // NotEnoughParticipants
  6006: "badRanking", // InvalidRanking
  6007: "badRanking", // DuplicateInRanking
  6008: "wrongRound", // WrongRound
  6009: "alreadyDone", // AlreadySealed
  6010: "sealIncomplete", // SealIncomplete
  6011: "profileTooLong", // ProfileTooLong
  6012: "badSession", // InvalidSession
  6013: "alreadyDone", // AlreadyClosed
  6014: "badPreferences", // InvalidPreferencesAccount
  6015: "randomnessDone", // RandomnessAlreadyFulfilled
  6016: "noRandomness", // RandomnessMissing
  6017: "badTickBudget", // InvalidTickBudget
  6018: "overflow", // MathOverflow
};

/** Everything the error object knows, own and inherited, as one string. */
function deepText(e: any, depth = 0): string {
  if (e === null || e === undefined || depth > 3) return "";
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
      parts.push(k + "=" + (typeof v === "object" ? deepText(v, depth + 1) : String(v)));
    }
  }
  return parts.join(" ");
}

/** Classify without guessing: each pattern is one a wallet really emits. */
export function classifyError(e: unknown): Reason {
  const blob = deepText(e);
  const text = blob.toLowerCase();

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

  // A program error, by name where the logs survived and by number where they
  // did not. Checked after the wallet cases above so a declined signature is
  // never reported as a program refusal.
  //
  // The number has to sit next to something saying it IS an error code — a
  // `code` field, or Solana printing "custom program error". Matching a bare
  // 6001 anywhere in the object would read "took 6001 milliseconds" as a
  // closed round.
  const codes: number[] = [];
  const collect = (re: RegExp) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(blob)) !== null) codes.push(Number(m[1]));
  };
  collect(/custom program error:\s*(0x[0-9a-fA-F]+)/gi);
  collect(/\b(?:error)?code=\s*(\d{4,5})\b/gi);
  for (const n of codes) {
    const reason = PROGRAM_ERRORS[n];
    if (reason) return reason;
  }
  const byName: Record<string, Reason> = {
    roundclosed: "roundClosed",
    wrongroundstatus: "roundClosed",
    roundstillopen: "tooEarly",
    sidefull: "sideFull",
    notenoughparticipants: "notEnough",
    invalidranking: "badRanking",
    duplicateinranking: "badRanking",
    alreadysealed: "alreadyDone",
    alreadyclosed: "alreadyDone",
    randomnessmissing: "noRandomness",
    deadlineinpast: "deadlinePast",
    profiletoolong: "profileTooLong",
    wronground: "wrongRound",
    sealincomplete: "sealIncomplete",
    invalidsession: "badSession",
    invalidpreferencesaccount: "badPreferences",
    randomnessalreadyfulfilled: "randomnessDone",
    invalidtickbudget: "badTickBudget",
    mathoverflow: "overflow",
  };
  for (const [name, reason] of Object.entries(byName)) {
    if (text.includes(name)) return reason;
  }

  return "unknown";
}
