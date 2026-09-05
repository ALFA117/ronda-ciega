"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

/** Public devnet RPC throttles hard; back off instead of hammering it. */
const BASE_POLL = 6000;
const MAX_POLL = 45000;

export function useRound(address: string): RoundView {
  const [round, setRound] = useState<RoundAccount | null>(null);
  const [participants, setParticipants] = useState<ParticipantAccount[]>([]);
  const [delegated, setDelegated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pollMs = useRef(BASE_POLL);
  const timer = useRef<number | null>(null);
  const subscription = useRef<{ conn: Connection; id: number } | null>(null);

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
      pollMs.current = BASE_POLL;
    } catch (e: any) {
      const msg = e?.message || String(e);
      // 429 is the public RPC asking for room, not a broken round. Widen the
      // gap and keep the last good state on screen rather than blanking it.
      if (msg.includes("429") || /rate/i.test(msg)) {
        pollMs.current = Math.min(pollMs.current * 2, MAX_POLL);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [address]);

  // Slow poll as the safety net. It is the fallback, not the mechanism —
  // the subscription below is what makes the page feel live.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await refresh();
      if (cancelled) return;
      timer.current = window.setTimeout(tick, pollMs.current);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [refresh]);

  // Push updates. The round account moves between L1 and the rollup, so the
  // subscription has to follow it: resubscribe on the other connection
  // whenever delegation flips.
  useEffect(() => {
    let key: PublicKey;
    try {
      key = new PublicKey(address);
    } catch {
      return;
    }

    const conn = delegated
      ? publicTeeConnection()
      : new Connection(DEVNET_RPC, "confirmed");
    const program = getReadProgram(conn);

    let id: number;
    try {
      id = conn.onAccountChange(
        key,
        (info) => {
          try {
            const decoded = (program.account as any).round.coder.accounts.decode(
              "round",
              info.data,
            );
            setRound(decodeRound(key, decoded));
          } catch {
            // A layout we cannot read is not worth blanking the page for; the
            // poll will report it if it is real.
          }
        },
        "confirmed",
      );
    } catch {
      return;
    }

    subscription.current = { conn, id };
    return () => {
      conn.removeAccountChangeListener(id).catch(() => {});
      subscription.current = null;
    };
  }, [address, delegated]);

  return { round, participants, delegated, loading, error, refresh };
}
