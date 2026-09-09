/**
 * The five steps a round goes through, as data.
 *
 * There used to be three tellings of this on one page: an animated graph in
 * the hero, a four-card diagram in section 03, and a numbered list inside the
 * start panel. They disagreed — four steps in one, four different ones in
 * another — and a reader who noticed had no way to know which was the real
 * shape of the thing.
 *
 * So the sequence lives here once, and every place that draws it draws this.
 * The hero draws it as a map, the creation form draws the same five nodes as
 * a rail you descend while opening a round, and the two are recognisably the
 * same picture because they are the same array.
 */

/** Where a step's account is written. The boundary is the whole argument. */
export type Where = "l1" | "enclave";

/**
 * What kind of step this is, for the eye.
 *
 * `where` answers which machine runs it; this answers what is at stake. They
 * are not the same question and collapsing them was tempting: money moves on
 * L1 and so does joining, but one of those is a profile and the other is
 * somebody's funds, and a diagram that paints them identically is a diagram
 * that buries its own point.
 */
export type Tone = "neutral" | "escrow" | "settled";

export interface FlowStep {
  id: "open" | "join" | "fund" | "seal" | "match" | "result" | "settle";
  where: Where;
  tone: Tone;
}

/**
 * Money in, decision in the dark, money out.
 *
 * The middle three steps were the whole diagram once, and the thing anybody
 * reading it asked next was "and then what". `fund` and `settle` are the
 * answer, and they sit on L1 on purpose: the enclave decides who, and L1 keeps
 * custody of what. Drawn end to end, the shape argues for itself — funds cross
 * into the dark region only as a name, never as a balance.
 */
export const FLOW: readonly FlowStep[] = [
  { id: "open", where: "l1", tone: "neutral" },
  { id: "join", where: "l1", tone: "neutral" },
  { id: "fund", where: "l1", tone: "escrow" },
  { id: "seal", where: "enclave", tone: "neutral" },
  { id: "match", where: "enclave", tone: "neutral" },
  { id: "result", where: "l1", tone: "neutral" },
  { id: "settle", where: "l1", tone: "settled" },
] as const;

/**
 * The contiguous run of steps that happen inside the enclave.
 *
 * Drawn as one banded region rather than a badge per step, which is what
 * makes it read as a boundary being crossed and re-crossed instead of two
 * cards that happen to be marked. Computed rather than written down, so
 * adding a step inside the enclave cannot leave the band behind.
 */
export function enclaveSpan(flow: readonly FlowStep[] = FLOW): {
  from: number;
  to: number;
} | null {
  const from = flow.findIndex((s) => s.where === "enclave");
  if (from === -1) return null;
  let to = from;
  while (to + 1 < flow.length && flow[to + 1].where === "enclave") to++;
  return { from, to };
}

/**
 * What a step on a rail is currently doing.
 *
 * `active` is the one being filled in, `done` is behind you, `ahead` has not
 * been reached. A rail that marked only "current" and "not current" made a
 * form of three questions look like three questions; naming the state behind
 * you is what turns it into progress.
 */
export type StepState = "done" | "active" | "ahead";

export function stepState(index: number, active: number, done: number[]): StepState {
  if (done.includes(index)) return "done";
  return index === active ? "active" : "ahead";
}

/**
 * Which step of the creation rail is the first one still unanswered.
 *
 * The rail is not a wizard: every control is on screen and reachable, and
 * somebody who goes back to change the duration should not lose the step
 * they had got to. So "active" is derived from what is still missing rather
 * than from a cursor that clicking moves, and a rail that is entirely filled
 * in points at the signature.
 */
export function firstUnanswered(answered: boolean[]): number {
  const i = answered.findIndex((a) => !a);
  return i === -1 ? answered.length - 1 : i;
}
