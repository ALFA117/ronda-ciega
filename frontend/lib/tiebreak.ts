import { advanceOneRound, buildState, MAX_PER_SIDE, NONE } from "./matching";

/**
 * Does the tie-break actually decide anything, on these lists?
 *
 * The page asserts that ties are broken with verifiable randomness rather than
 * by registration order, and that this matters. That is a claim about a
 * counterfactual — what the pairing would have been under a different seed —
 * and nowhere on the page could a reader see it happen.
 *
 * They can be seen: the same lists, run under several seeds, and the pairings
 * compared. Both answers are worth showing. Ties are not guaranteed — Gale-
 * Shapley only needs one when a receiver has ranked *neither* of two
 * proposers — so on many markets every seed gives the identical answer, and
 * saying so is more convincing than implying the seed always matters. When it
 * does matter, it decided somebody's match.
 *
 * This is the same implementation the chain runs, driven with a different
 * randomness argument. Nothing here is a model of the algorithm.
 */

export interface Sensitivity {
  /** How many seeds were tried, including the one on screen. */
  tried: number;
  /** How many of them produced a pairing different from the one on screen. */
  differing: number;
  /** How many distinct pairings the seeds produced in total. */
  distinct: number;
}

/** Run the whole matching for one seed and return the final pairing. */
export function pairingFor(
  founderRankings: number[][],
  builderRankings: number[][],
  founderCount: number,
  randomness: Uint8Array,
): number[] {
  const ms = buildState(founderRankings, builderRankings);
  const pairs = new Array(MAX_PER_SIDE).fill(NONE);
  // The loop bound mirrors the program's tick budget: Gale-Shapley terminates
  // in at most n rounds per proposer, and a runaway here would hang the tab.
  for (let i = 0; i < 32; i++) {
    if (advanceOneRound(ms, pairs, founderCount, randomness) === 0) break;
  }
  return pairs.slice(0, founderCount);
}

export function sensitivity(
  founderRankings: number[][],
  builderRankings: number[][],
  founderCount: number,
  baseline: Uint8Array,
  alternatives: Uint8Array[],
): Sensitivity {
  const key = (p: number[]) => p.join(",");
  const base = key(pairingFor(founderRankings, builderRankings, founderCount, baseline));

  const seen = new Set<string>([base]);
  let differing = 0;
  for (const rnd of alternatives) {
    const k = key(pairingFor(founderRankings, builderRankings, founderCount, rnd));
    if (k !== base) differing++;
    seen.add(k);
  }

  return {
    tried: alternatives.length + 1,
    differing,
    distinct: seen.size,
  };
}

/**
 * Thirty-two bytes from a small integer, well mixed.
 *
 * The playground used a linear congruential generator and took the top byte of
 * each step. Measured across two hundred consecutive seeds, `bytes[0]` came
 * back as 60 every single time: one LCG step from a small seed barely moves
 * the high bits, so the first output is effectively constant while later ones
 * vary. `break_tie` compares two bytes, and one of them was frozen — the
 * challenger won 150 times out of 200 where a fair source gives about 100.
 *
 * A demonstration of unbiased, verifiable tie-breaks was running on a biased
 * source. Nothing on chain was affected: the program breaks ties with real VRF
 * output and never calls this. It was the interactive argument for the VRF
 * that was quietly wrong.
 *
 * This is murmur3's finalizer over (seed, index), which decorrelates adjacent
 * seeds and every byte position from every other.
 */
export function seedBytes(seed: number): Uint8Array {
  const s = (seed >>> 0) || 1;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    let h = (s ^ Math.imul(i, 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    out[i] = ((h ^ (h >>> 16)) >>> 0) & 0xff;
  }
  return out;
}
