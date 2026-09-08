import { NONE } from "./constants";

/**
 * Check a transparent round's published trace against its published result.
 *
 * A transparent round records one frame per proposal round. That trace is
 * public, so anyone can ask whether it is internally consistent and whether it
 * ends where the chain says it ended — without a wallet, without an RPC, and
 * without trusting this site.
 *
 * What this CANNOT check, and must not pretend to: whether the hidden
 * preference lists were respected. Verifying that would require the lists,
 * and the lists were destroyed unpublished. That is the trade the whole
 * project makes — you get a verifiable process and a verifiable outcome, and
 * you give up verifying the inputs. Saying so is part of the check.
 */
export interface Check {
  id: string;
  ok: boolean;
  /** The measurement behind the verdict, so the claim is inspectable. */
  detail: string;
}

export function verifyRound(input: {
  frames: number[][];
  pairs: number[];
  founderCount: number;
  builderCount: number;
}): { checks: Check[]; allPassed: boolean } {
  const { frames, pairs, founderCount, builderCount } = input;
  const checks: Check[] = [];
  const slice = (f: number[]) => f.slice(0, founderCount);

  // 1. No builder is held by two founders, in any frame.
  let injective = true;
  let firstBad = -1;
  frames.forEach((f, i) => {
    const taken = slice(f).filter((b) => b !== NONE);
    if (new Set(taken).size !== taken.length && injective) {
      injective = false;
      firstBad = i;
    }
  });
  checks.push({
    id: "injective",
    ok: injective,
    detail: injective
      ? `${frames.length} frames`
      : `frame ${firstBad} reuses a builder`,
  });

  // 2. Every index refers to somebody who is actually in the round.
  const inRange = frames.every((f) =>
    slice(f).every((b) => b === NONE || (b >= 0 && b < builderCount)),
  );
  checks.push({
    id: "inRange",
    ok: inRange,
    detail: `0–${Math.max(builderCount - 1, 0)}`,
  });

  // 3. The count of matched founders never falls. Gale–Shapley only ever
  //    swaps a builder's holder — one leaves as another arrives — or fills an
  //    empty slot, so a drop would mean the trace is not a run of it.
  const counts = frames.map((f) => slice(f).filter((b) => b !== NONE).length);
  let monotone = true;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] < counts[i - 1]) monotone = false;
  }
  checks.push({
    id: "monotone",
    ok: monotone,
    detail: counts.join(" → ") || "—",
  });

  // 4. No pairing in the trace simply evaporates.
  //
  //    The four checks around this one are each necessary and none of them
  //    looks at what happens BETWEEN two frames, so a trace could satisfy all
  //    of them and still contain a move the algorithm cannot make. This one
  //    needs no preference list, which is why it can be checked at all: when a
  //    founder stops holding a builder, somebody else must be holding that
  //    builder in the next frame. A founder only ever loses one to a better
  //    proposer, so a pairing that disappears with nobody taking it is not a
  //    rejection — it is a trace that was edited.
  //
  //    A stricter rule was tried first and the real rounds falsified it: that
  //    a founder matched in both frames must be matched to the SAME builder,
  //    on the reasoning that a founder only proposes while unmatched. That is
  //    true of the abstract algorithm and false of this implementation, which
  //    runs a whole proposal round as one sequential loop. A founder displaced
  //    by somebody with a LOWER index is unmatched again before the loop
  //    reaches them, so they propose and re-pair inside the very same frame.
  //    Two of the three transparent demo rounds do exactly that.
  let legalSteps = true;
  let illegal = "";
  for (let i = 1; i < frames.length && legalSteps; i++) {
    const before = slice(frames[i - 1]);
    const after = slice(frames[i]);
    for (let fdr = 0; fdr < founderCount; fdr++) {
      const was = before[fdr];
      if (was === NONE || after[fdr] === was) continue;
      // They let go of `was`. Someone has to be holding it now.
      if (!after.some((b, other) => other !== fdr && b === was)) {
        legalSteps = false;
        illegal = `frame ${i}: builder ${was} left founder ${fdr} and went to nobody`;
        break;
      }
    }
  }
  checks.push({
    id: "legalSteps",
    ok: legalSteps,
    detail: legalSteps
      ? `${Math.max(frames.length - 1, 0)} transitions`
      : illegal,
  });

  // 5. The last published frame is the result the chain reports.
  const last = frames.length ? slice(frames[frames.length - 1]) : [];
  const onChain = slice(pairs);
  const matchesChain =
    last.length === onChain.length && last.every((b, i) => b === onChain[i]);
  checks.push({
    id: "matchesChain",
    ok: matchesChain,
    detail: matchesChain
      ? `${onChain.filter((b) => b !== NONE).length}/${founderCount} pairs`
      : "trace ends elsewhere",
  });

  return { checks, allPassed: checks.every((c) => c.ok) };
}
