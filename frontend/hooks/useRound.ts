"use client";

import { useCallback, useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { DELEGATION_PROGRAM_ID } from "@magicblock-labs/ephemeral-rollups-sdk";
import { DEVNET_RPC } from "@/lib/constants";
import {
  decodeParticipant,
  decodeRound,
  getReadProgram,
  ParticipantAccount,
  RoundAccount,
} from "@/lib/program";
import { publicTeeConnection } from "@/lib/tee";

export interface RoundView {
  round: RoundAccount | null;
  participants: ParticipantAccount[];
  /** Once delegated, the live state lives on the rollup, not on L1. */
  delegated: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useRound(address: string, pollMs = 3000): RoundView {
  const [round, setRound] = useState<RoundAccount | null>(null);
  const [participants, setParticipants] = useState<ParticipantAccount[]>([]);
  const [delegated, setDelegated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const key = new PublicKey(address);
      const l1 = new Connection(DEVNET_RPC, "confirmed");

      // A delegated account is owned by the delegation program on L1, and its
      // data there is stale — the rollup holds the live copy.
      const info = await l1.getAccountInfo(key);
      const isDelegated =
        !!info && info.owner.equals(new PublicKey(DELEGATION_PROGRAM_ID));
      setDelegated(isDelegated);

      const stateConn = isDelegated ? publicTeeConnection() : l1;
      const program = getReadProgram(stateConn);
      const raw = await (program.account as any).round.fetch(key);
      setRound(decodeRound(key, raw));

      // Participants are never delegated, so they always come from L1.
      const l1Program = getReadProgram(l1);
      const all = await (l1Program.account as any).participant.all([
        { memcmp: { offset: 8, bytes: key.toBase58() } },
      ]);
      setParticipants(
        all
          .map((p: any) => decodeParticipant(p.publicKey, p.account))
          .sort((a: ParticipantAccount, b: ParticipantAccount) => a.index - b.index),
      );
      setError(null);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { round, participants, delegated, loading, error, refresh };
}
