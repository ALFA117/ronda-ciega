import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { idl, NONE } from "./constants";

export interface WalletLike {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction>(txs: T[]) => Promise<T[]>;
}

export function getProgram(connection: Connection, wallet: WalletLike): Program {
  const provider = new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
  });
  return new Program(idl as Idl, provider);
}

/** Read-only client for fetching accounts without a connected wallet. */
export function getReadProgram(connection: Connection): Program {
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: PublicKey.default,
      signTransaction: async (t: any) => t,
      signAllTransactions: async (t: any) => t,
    } as any,
    { commitment: "confirmed" },
  );
  return new Program(idl as Idl, provider);
}

export type RoundStatus = "open" | "sealing" | "matching" | "settled";

export interface RoundAccount {
  address: PublicKey;
  authority: PublicKey;
  roundId: bigint;
  deadlineTs: number;
  minPerSide: number;
  founderCount: number;
  builderCount: number;
  rankingCount: number;
  sealedCount: number;
  tick: number;
  pairs: number[];
  status: RoundStatus;
  transparent: boolean;
  history: number[][];
  historyLen: number;
}

export function decodeRound(address: PublicKey, raw: any): RoundAccount {
  const status = (Object.keys(raw.status)[0] as RoundStatus) || "open";
  return {
    address,
    authority: raw.authority,
    roundId: BigInt(raw.roundId.toString()),
    deadlineTs: Number(raw.deadlineTs),
    minPerSide: raw.minPerSide,
    founderCount: raw.founderCount,
    builderCount: raw.builderCount,
    rankingCount: raw.rankingCount,
    sealedCount: raw.sealedCount,
    tick: raw.tick,
    pairs: Array.from(raw.pairs as number[]),
    status,
    transparent: raw.transparent,
    history: (raw.history as number[][]).map((h) => Array.from(h)),
    historyLen: raw.historyLen,
  };
}

export interface ParticipantAccount {
  address: PublicKey;
  wallet: PublicKey;
  side: "founder" | "builder";
  index: number;
  handle: string;
  link: string;
}

export function decodeParticipant(address: PublicKey, raw: any): ParticipantAccount {
  return {
    address,
    wallet: raw.wallet,
    side: Object.keys(raw.side)[0] as "founder" | "builder",
    index: raw.index,
    handle: raw.handle,
    link: raw.link,
  };
}

/**
 * Frames for the animation: the recorded history, then the final state.
 * A round that is not transparent has no history, so this is just the outcome —
 * which is the honest thing to show, not a fallback.
 */
export function framesFor(round: RoundAccount): number[][] {
  const frames = round.history.slice(0, round.historyLen);
  frames.push(round.pairs);
  return frames;
}

export const isPaired = (v: number) => v !== NONE;
