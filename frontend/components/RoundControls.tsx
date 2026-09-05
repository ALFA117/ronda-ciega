"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import BN from "bn.js";
import { permissionPdaFromAccount } from "@magicblock-labs/ephemeral-rollups-sdk";
import { getProgram, ParticipantAccount, RoundAccount } from "@/lib/program";
import { matchStatePda, preferencesPda } from "@/lib/pdas";
import { teeConnection } from "@/lib/tee";
import { TEE_VALIDATOR } from "@/lib/constants";
import { useT } from "@/lib/i18n";
import { Button, Label, Note, Panel } from "./ui";

/**
 * The round authority drives the phase changes. Each button maps to exactly one
 * instruction, and the label says what it does on chain rather than what it
 * means to the user, because the person clicking is running the round.
 */
export function RoundControls({
  round,
  participants,
  delegated,
  onDone,
}: {
  round: RoundAccount;
  participants: ParticipantAccount[];
  delegated: boolean;
  onDone: () => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const roundId = new BN(round.roundId.toString());
  const matchState = matchStatePda(round.address);
  const deadlinePassed = Date.now() / 1000 >= round.deadlineTs;

  const say = (m: string) => setLog((l) => [...l, m]);

  async function er() {
    const conn = await teeConnection(wallet.publicKey!, (m) =>
      wallet.signMessage!(m),
    );
    return getProgram(conn, wallet as any);
  }

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  const delegate = () =>
    run("delegate", async () => {
      const program = getProgram(connection, wallet as any);
      await program.methods
        .delegateRound(roundId)
        .accountsPartial({
          authority: wallet.publicKey!,
          round: round.address,
          validator: TEE_VALIDATOR,
        })
        .rpc();
      say(t.controls.delegated);

      const erProgram = await er();
      await erProgram.methods
        .initMatchState(roundId)
        .accountsPartial({
          payer: wallet.publicKey!,
          round: round.address,
          matchState,
          matchStatePermission: permissionPdaFromAccount(matchState),
        })
        .rpc();
      say(t.controls.matchStateCreated);
    });

  const settle = () =>
    run("settle", async () => {
      const erProgram = await er();

      await erProgram.methods
        .closeRound(roundId)
        .accountsPartial({ round: round.address })
        .rpc();
      say(t.controls.closed);

      // Chunked so the account list always fits in one transaction.
      const withRankings = participants.slice(0, round.rankingCount);
      for (let i = 0; i < withRankings.length; i += 8) {
        await erProgram.methods
          .sealPreferences(roundId)
          .accountsPartial({ round: round.address, matchState })
          .remainingAccounts(
            withRankings.slice(i, i + 8).map((p) => ({
              pubkey: preferencesPda(round.address, p.wallet),
              isSigner: false,
              isWritable: false,
            })),
          )
          .rpc();
      }
      say(`${withRankings.length} ${t.controls.ingested}`);

      const started = Date.now();
      const sig = await erProgram.methods
        .runMatching(roundId, 64)
        .accountsPartial({ round: round.address, matchState })
        .rpc();
      say(`${t.controls.matched} · ${Date.now() - started} ${t.controls.wallClock}`);
      say(sig);
    });

  if (!wallet.publicKey || !wallet.publicKey.equals(round.authority)) {
    return null;
  }

  return (
    <Panel className="space-y-4 p-6">
      <Label>{t.controls.label}</Label>

      <div className="flex flex-wrap gap-2">
        {!delegated && (
          <Button onClick={delegate} busy={busy === "delegate"}>
            {t.controls.delegate}
          </Button>
        )}
        {delegated && round.status === "open" && (
          <Button
            onClick={settle}
            busy={busy === "settle"}
            disabled={!deadlinePassed}
          >
            {deadlinePassed ? t.controls.settle : t.controls.waitingDeadline}
          </Button>
        )}
        {delegated && round.status === "matching" && (
          <Button onClick={settle} busy={busy === "settle"}>
            {t.controls.continue}
          </Button>
        )}
      </div>

      {!delegated && (
        <Note>
          {t.controls.notDelegated}
        </Note>
      )}

      {log.length > 0 && (
        <div className="space-y-1 border-t border-edge pt-4">
          {log.map((l, i) => (
            <div key={i} className="break-all font-mono text-2xs text-muted">
              {l}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="font-mono text-2xs leading-relaxed text-red-400">
          {error}
        </p>
      )}
    </Panel>
  );
}
