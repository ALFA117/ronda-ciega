import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  MATCH_STATE_SEED,
  PARTICIPANT_SEED,
  PREFERENCES_SEED,
  PROGRAM_ID,
  ROUND_SEED,
} from "./constants";

export function roundPda(authority: PublicKey, roundId: BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [ROUND_SEED, authority.toBuffer(), roundId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  )[0];
}

export function participantPda(round: PublicKey, wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [PARTICIPANT_SEED, round.toBuffer(), wallet.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function preferencesPda(round: PublicKey, wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [PREFERENCES_SEED, round.toBuffer(), wallet.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function matchStatePda(round: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [MATCH_STATE_SEED, round.toBuffer()],
    PROGRAM_ID,
  )[0];
}

/**
 * Where a wallet's deposit for a round lives.
 *
 * On L1 and never delegated, which is the point: the enclave decides who, and
 * this account holds what. Same shape as every other PDA here so the pattern
 * stays boring — the seed is a constant, the two keys are the round and its
 * owner, and the address is derivable by anyone who wants to check a balance.
 */
export function escrowPda(round: PublicKey, wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), round.toBuffer(), wallet.toBuffer()],
    PROGRAM_ID,
  )[0];
}
