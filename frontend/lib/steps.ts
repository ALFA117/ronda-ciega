import { NONE } from "./constants";

/**
 * Which step of their own journey a visitor is on, and who they ended up with.
 *
 * This lives outside the component because both answers are easy to get subtly
 * wrong and impossible to see when they are: a rail that invites you to join a
 * closed round still renders, and a pairing lookup that reads the wrong side of
 * `pairs` tells every builder in the round they were unmatched. Neither throws.
 * So the logic is pure and tested, and the component only draws it.
 */

export type StepId = "connect" | "join" | "wait" | "rank" | "result";

export interface StepInput {
  /** Round status is "open" only while people can still take part. */
  open: boolean;
  /** Has the visitor connected a wallet at all. */
  connected: boolean;
  /** Is that wallet a participant in this round. */
  joined: boolean;
  /** A ranking cannot exist before the round reaches the rollup. */
  delegated: boolean;
}

export function currentStep({
  open,
  connected,
  joined,
  delegated,
}: StepInput): StepId {
  if (!connected) return "connect";
  if (!open) return "result";
  if (!joined) return "join";
  if (!delegated) return "wait";
  return "rank";
}

/**
 * A closed round the visitor never took part in has no journey to show them.
 * Drawing the rail there is the bug this predicate exists to prevent.
 */
export function isBystander({ open, joined }: Pick<StepInput, "open" | "joined">) {
  return !open && !joined;
}

/**
 * `pairs` is indexed by founder and holds a builder index, so the two sides
 * are looked up in opposite directions. Returns the partner's index on the
 * other side, or null when this participant went unmatched.
 */
export function partnerIndex(
  pairs: number[],
  side: "founder" | "builder",
  index: number,
): number | null {
  if (side === "founder") {
    const b = pairs[index];
    return b === undefined || b === NONE ? null : b;
  }
  const f = pairs.findIndex((b) => b === index);
  return f === -1 ? null : f;
}
