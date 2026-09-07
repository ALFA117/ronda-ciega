/**
 * Reading a negative result correctly.
 *
 * The privacy claim is proved by an absence: ask for someone's preference list
 * and get nothing back. The trouble with an absence is that a broken query
 * produces exactly the same one. The README has said so from the start — "the
 * control line matters more than the refusal" — and the panel that shipped had
 * no control in it at all: a lone zero, indistinguishable from a query pointed
 * at the wrong cluster.
 *
 * So each lane is probed twice. Once for something that must be there, and
 * once for the thing that must not. The verdict is only allowed to mean
 * anything when the first read succeeded.
 */

export interface ProbeResults {
  /** The public round account, read from L1. Must be found. */
  l1Control: boolean | null;
  /** The same account, read from the rollup with no auth token. Must be found. */
  teeControl: boolean | null;
  /** Preference accounts found on L1. Must be zero. */
  l1Found: number | null;
  /** Preference accounts an unauthenticated rollup connection got back. Must be zero. */
  teeFound: number | null;
  /** How many addresses were asked for in each lane. */
  checked: number;
}

export type Verdict =
  /** Not finished, or never run. */
  | "pending"
  /** A control failed. The absences below it prove nothing either way. */
  | "inconclusive"
  /** Controls passed and nothing readable came back. */
  | "shielded"
  /** Something came back. The claim is false and the page must say so. */
  | "leaked";

export function verdict(r: ProbeResults): Verdict {
  const complete =
    r.l1Control !== null &&
    r.teeControl !== null &&
    r.l1Found !== null &&
    r.teeFound !== null;
  if (!complete) return "pending";

  // A finding beats a failed control: if a list came back, it came back, and
  // nothing about a broken connection makes that better.
  if ((r.l1Found ?? 0) > 0 || (r.teeFound ?? 0) > 0) return "leaked";

  // Nothing came back — but a connection that cannot read the public round
  // account cannot be trusted to have really looked for anything else.
  if (!r.l1Control || !r.teeControl) return "inconclusive";

  return "shielded";
}

/** Did this individual probe do what it was supposed to? */
export function probeOk(
  kind: "control" | "absence",
  value: boolean | number | null,
): boolean | null {
  if (value === null) return null;
  return kind === "control" ? value === true : value === 0;
}
