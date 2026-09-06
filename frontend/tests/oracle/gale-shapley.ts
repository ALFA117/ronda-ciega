/**
 * A second implementation of the on-chain matching, written from the Rust
 * rather than shared with it.
 *
 * The point of a test oracle is that it is NOT the code under test: if this
 * file and `advance_one_round` in programs/ronda-ciega/src/lib.rs agree on a
 * few thousand random inputs, a transcription error in either one has to have
 * been made twice, identically. Mirror any change to the Rust here, or the
 * cross-check stops meaning anything.
 */

export const MAX_PER_SIDE = 16;
export const NONE = 255;
export const UNRANKED = 255;

export interface MatchState {
  /** founderRanking[f] = builder indices, best first. */
  founderRanking: number[][];
  founderLen: number[];
  /** builderRank[b][f] = position of f in b's list; UNRANKED if absent. */
  builderRank: number[][];
  cursor: number[];
  /** hold[b] = founder currently held by b, or NONE. */
  hold: number[];
}

/** Lower byte loses. Equal bytes fall back to index order. */
export function breakTie(
  randomness: Uint8Array,
  builder: number,
  challenger: number,
  incumbent: number,
): boolean {
  const a = randomness[(builder * 3 + challenger) % 32];
  const b = randomness[(builder * 3 + incumbent) % 32];
  if (a === b) return challenger < incumbent;
  return a > b;
}

/** One proposal round. Returns how many proposals were made. */
export function advanceOneRound(
  ms: MatchState,
  pairs: number[],
  founderCount: number,
  randomness: Uint8Array,
): number {
  let proposals = 0;

  for (let f = 0; f < founderCount; f++) {
    if (pairs[f] !== NONE) continue;
    const cursor = ms.cursor[f];
    if (cursor >= ms.founderLen[f]) continue;

    const b = ms.founderRanking[f][cursor];
    ms.cursor[f] = cursor + 1;
    proposals++;

    const incumbent = ms.hold[b];
    if (incumbent === NONE) {
      ms.hold[b] = f;
      pairs[f] = b;
      continue;
    }

    const challengerRank = ms.builderRank[b][f];
    const incumbentRank = ms.builderRank[b][incumbent];

    const challengerWins =
      challengerRank !== incumbentRank
        ? challengerRank < incumbentRank
        : breakTie(randomness, b, f, incumbent);

    if (challengerWins) {
      ms.hold[b] = f;
      pairs[f] = b;
      pairs[incumbent] = NONE;
    }
  }

  return proposals;
}

export interface MatchingResult {
  pairs: number[];
  ticks: number;
  totalProposals: number;
  settled: boolean;
  /** One frame per tick, as a transparent round records them. */
  history: number[][];
}

export function runMatching(
  ms: MatchState,
  founderCount: number,
  randomness: Uint8Array,
  maxTicks = 64,
): MatchingResult {
  const pairs = new Array(MAX_PER_SIDE).fill(NONE);
  const history: number[][] = [];
  let ticks = 0;
  let totalProposals = 0;
  let settled = false;

  for (let i = 0; i < maxTicks; i++) {
    const proposals = advanceOneRound(ms, pairs, founderCount, randomness);
    ticks++;
    totalProposals += proposals;
    if (proposals === 0) {
      settled = true;
      break;
    }
    history.push([...pairs]);
  }

  return { pairs, ticks, totalProposals, settled, history };
}

/** Build a MatchState the way `submit_ranking` + `seal_preferences` do. */
export function buildState(
  founderRankings: number[][],
  builderRankings: number[][],
): MatchState {
  const builderRank: number[][] = builderRankings.map((list) => {
    const inv = new Array(MAX_PER_SIDE).fill(UNRANKED);
    list.forEach((founder, position) => {
      inv[founder] = position;
    });
    return inv;
  });

  return {
    founderRanking: founderRankings.map((l) => [...l]),
    founderLen: founderRankings.map((l) => l.length),
    builderRank,
    cursor: new Array(MAX_PER_SIDE).fill(0),
    hold: new Array(MAX_PER_SIDE).fill(NONE),
  };
}

/**
 * A blocking pair is a founder and a builder who would both rather have each
 * other than what they got. A matching with none is stable — that is the whole
 * guarantee the product sells, so it is the thing worth asserting.
 *
 * Ranks that are equal are not a preference: two founders a builder never
 * ranked are indifferent, and indifference cannot block.
 */
export function findBlockingPair(
  pairs: number[],
  founderRankings: number[][],
  builderRank: number[][],
  founderCount: number,
): { founder: number; builder: number } | null {
  for (let f = 0; f < founderCount; f++) {
    const current = pairs[f];
    const list = founderRankings[f];
    const currentPos = current === NONE ? Infinity : list.indexOf(current);

    for (let pos = 0; pos < list.length; pos++) {
      const b = list[pos];
      if (pos >= currentPos) break; // f does not prefer b to what f has

      // Who holds b right now?
      const holder = pairs.findIndex((v, i) => i < founderCount && v === b);
      if (holder === -1) return { founder: f, builder: b }; // b is free
      if (builderRank[b][f] < builderRank[b][holder]) {
        return { founder: f, builder: b };
      }
    }
  }
  return null;
}
