"use client";

import { useEffect, useRef, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { DEVNET_RPC } from "@/lib/constants";
import { decodeParticipant, getReadProgram } from "@/lib/program";
import type { ParticipantAccount } from "@/lib/program";

/**
 * Participants for one round, fetched on demand and remembered.
 *
 * This exists for hover previews, so it has to be careful: a list of rounds
 * would otherwise fire one `getProgramAccounts` per row the pointer crosses on
 * its way somewhere else. The fetch waits for the pointer to settle, the
 * result is cached for the life of the page, and a second hover on the same
 * round costs nothing.
 */
const cache = new Map<string, ParticipantAccount[]>();
const inflight = new Map<string, Promise<ParticipantAccount[]>>();

async function load(address: string): Promise<ParticipantAccount[]> {
  const hit = cache.get(address);
  if (hit) return hit;

  const running = inflight.get(address);
  if (running) return running;

  const p = (async () => {
    const key = new PublicKey(address);
    const program = getReadProgram(new Connection(DEVNET_RPC, "confirmed"));
    const all = await (program.account as any).participant.all([
      { memcmp: { offset: 8, bytes: key.toBase58() } },
    ]);
    const list = all
      .map((r: any) => decodeParticipant(r.publicKey, r.account))
      .sort((a: ParticipantAccount, b: ParticipantAccount) => a.index - b.index);
    cache.set(address, list);
    inflight.delete(address);
    return list;
  })();

  inflight.set(address, p);
  return p;
}

export function useParticipants(address: string, enabled: boolean, delayMs = 220) {
  const [data, setData] = useState<ParticipantAccount[] | null>(
    () => cache.get(address) ?? null,
  );
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || data) return;

    // Wait for the pointer to settle before spending a request on a row it is
    // only passing over.
    timer.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        setData(await load(address));
      } catch {
        setData([]);
      } finally {
        setLoading(false);
      }
    }, delayMs);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [address, enabled, data, delayMs]);

  return { participants: data, loading };
}
