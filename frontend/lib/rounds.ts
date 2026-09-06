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

  rounds.sort((a, b) => Number(b.roundId - a.roundId));
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
