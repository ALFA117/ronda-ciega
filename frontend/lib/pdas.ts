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
