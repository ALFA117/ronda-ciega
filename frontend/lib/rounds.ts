import { Connection, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { NONE, PROGRAM_ID } from "./constants";
import { decodeRound } from "./program";
import type { RoundAccount } from "./program";

/**
 * Decode whatever a getProgramAccounts call returned, dropping what it cannot.
 *
 * `program.account.round.all()` decodes the whole set and throws on the first
 * account it cannot read — so a single round created before a field was added
 * takes the entire listing down with it. Rounds are long-lived on devnet and
 * the layout has already grown once, so this decodes them one at a time.
 */
function decodeAll(
  program: Program,
  raw: { pubkey: PublicKey; account: { data: Buffer } }[],
): { rounds: RoundAccount[]; skipped: number } {
  const rounds: RoundAccount[] = [];
  let skipped = 0;
  for (const { pubkey, account } of raw) {
    try {
      const decoded = (program.account as any).round.coder.accounts.decode(
        "round",
        account.data,
      );
      rounds.push(decodeRound(pubkey, decoded));
    } catch {
      skipped += 1;
    }
  }
  return { rounds, skipped };
}

/**
 * Merge two listings, preferring the rollup's copy of any round in both.
 *
 * A delegated round exists on both chains and the rollup's is the live one:
 * L1 keeps whatever was there when it was handed over, which is a snapshot
 * that stops counting the people still joining.
 */
export function mergeRounds(
  l1: RoundAccount[],
  rollup: RoundAccount[],
): RoundAccount[] {
  const byAddress = new Map<string, RoundAccount>();
  for (const r of l1) byAddress.set(r.address.toBase58(), r);
  for (const r of rollup) byAddress.set(r.address.toBase58(), r);
  return Array.from(byAddress.values()).sort(byInterest);
}

/**
 * Fetch every round, from both chains.
 *
 * This asked L1 alone, and L1 cannot see an open round. Delegation transfers
 * the account to the delegation program, so a `getProgramAccounts` filtered
 * by this program's id matches only rounds that are back — which is to say,
 * the finished ones. Every round in the flow is delegated while it is open, so
 * the listing on the front page could never contain a round anybody could
 * join. Seventeen rounds, none of them open, and no error anywhere: a visitor
 * concludes nothing is live, which is the opposite of true.
 *
 * The rollup is asked with no auth token — the round account is public there,
 * which the privacy panel demonstrates on every round page. If the rollup is
 * unreachable the L1 half still renders, because a listing missing its open
 * rounds is worse than the one it replaced but much better than none.
 */
export async function fetchRounds(
  connection: Connection,
  program: Program,
  rollup?: Connection,
): Promise<{ rounds: RoundAccount[]; skipped: number }> {
  const discriminator = (program.account as any).round.coder.accounts.memcmp(
    "round",
  ).bytes;
  const filters = [{ memcmp: { offset: 0, bytes: discriminator } }];

  const [l1Raw, rollupRaw] = await Promise.all([
    connection.getProgramAccounts(PROGRAM_ID, { filters }),
    rollup
      ? rollup.getProgramAccounts(PROGRAM_ID, { filters }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const a = decodeAll(program, l1Raw as any);
  const b = decodeAll(program, rollupRaw as any);

  return { rounds: mergeRounds(a.rounds, b.rounds), skipped: a.skipped + b.skipped };
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
export function interest(r: RoundAccount): number {
  // "Under way" means it could actually close: lists are in, or both sides
  // have reached the minimum. Counting participants across both sides called a
  // round with one founder and sixteen builders busy, when it can never settle.
  const goingSomewhere =
    r.rankingCount > 0 ||
    (r.founderCount >= r.minPerSide && r.builderCount >= r.minPerSide);

  // An open round that could actually close is the only thing on this page a
  // visitor can take part in, so it leads.
  //
  // "Could actually close" is stricter than "going somewhere": a round with one
  // founder, one builder and two sealed lists is going somewhere by the ranking
  // count and can never settle, because the minimum is per side. Those led the
  // listing for a moment and pushed the finished demo rounds below the fold —
  // an invitation to something that cannot happen, ahead of the thing worth
  // looking at.
  //
  // The listing used to rank finished rounds above everything, which was right
  // while open rounds could not appear on it at all — they are delegated, and
  // L1 cannot see a delegated account. Now that both chains are asked, that
  // order buries the one round somebody could join under every round that is
  // already over. A settled round is the better demonstration; an open one is
  // the better invitation, and a visitor who wants the demonstration is one
  // click away either way.
  const bothSidesReady =
    r.founderCount >= r.minPerSide && r.builderCount >= r.minPerSide;
  if (r.status === "open" && bothSidesReady) return 3;
  if (r.status === "settled" && r.pairs.some((b) => b !== NONE)) return 2;
  if (goingSomewhere) return 1;
  return 0;
}

/**
 * Open rounds you could join first, then rounds with results, then rounds
 * under way, then empty ones. Within a group the bigger market leads: a 6x6
 * round shows the algorithm doing something a 2x2 round cannot, and that is
 * what a first-time visitor should open. Ties fall to the most recent.
 */
export function byInterest(a: RoundAccount, b: RoundAccount): number {
  const tier = interest(b) - interest(a);
  if (tier !== 0) return tier;
  const size =
    b.founderCount + b.builderCount - (a.founderCount + a.builderCount);
  if (size !== 0) return size;
  return Number(b.roundId - a.roundId);
}
