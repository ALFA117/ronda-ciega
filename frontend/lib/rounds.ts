import { Connection, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { NONE, PROGRAM_ID } from "./constants";
import { decodeRound } from "./program";
import type { RoundAccount } from "./program";

/**
 * Fetch every round, tolerating accounts written by an older layout.
 *
 * `program.account.round.all()` decodes the whole set and throws on the first
 * account it cannot read — so a single round created before a field was added
 * takes the entire listing down with it. Rounds are long-lived on devnet and
 * the layout has already grown once, so this decodes them one at a time and
 * drops the ones that no longer parse.
 */
export async function fetchRounds(
  connection: Connection,
  program: Program,
): Promise<{ rounds: RoundAccount[]; skipped: number }> {
  const discriminator = (program.account as any).round.coder.accounts.memcmp(
    "round",
  ).bytes;

  const raw = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ memcmp: { offset: 0, bytes: discriminator } }],
  });

  const rounds: RoundAccount[] = [];
  let skipped = 0;

  for (const { pubkey, account } of raw) {
    try {
      const decoded = (program.account as any).round.coder.accounts.decode(
        "round",
        account.data,
      );
      rounds.push(decodeRound(pubkey as PublicKey, decoded));
    } catch {
      skipped += 1;
    }
  }

  rounds.sort(byInterest);
  return { rounds, skipped };
}

/**
 * The round the ticker should show: the most recent one that actually settled
 * with at least one pair. Nothing to show until then — an empty ticker is
 * worse than no ticker.
 *
 * Lives here rather than in the component so it can be tested without React.
 */
export function pickTickerRound(rounds: RoundAccount[] | null): RoundAccount | undefined {
  return rounds?.find((r) => r.status === "settled" && r.pairs.some((b) => b !== NONE));
}

/**
 * How much there is to look at, 2 down to 0.
 *
 * Devnet keeps every round ever opened, and test runs leave behind stubs with
 * one participant and no lists. Sorted purely by recency those land on top and
 * bury the rounds that actually finished. Nothing is hidden — a round with
 * nothing in it is simply not the first thing a visitor should meet.
 */
function interest(r: RoundAccount): number {
  if (r.status === "settled" && r.pairs.some((b) => b !== NONE)) return 2;
  if (r.rankingCount > 0 || r.founderCount + r.builderCount >= 4) return 1;
  return 0;
}

/**
 * Rounds with results first, then rounds under way, then empty ones. Within a
 * group the bigger market leads: a 6x6 round shows the algorithm doing
 * something a 2x2 round cannot, and that is what a first-time visitor should
 * open. Ties fall to the most recent.
 */
export function byInterest(a: RoundAccount, b: RoundAccount): number {
  const tier = interest(b) - interest(a);
  if (tier !== 0) return tier;
  const size =
    b.founderCount + b.builderCount - (a.founderCount + a.builderCount);
  if (size !== 0) return size;
  return Number(b.roundId - a.roundId);
}
