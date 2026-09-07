"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import BN from "bn.js";
import { permissionPdaFromAccount } from "@magicblock-labs/ephemeral-rollups-sdk";
import { getProgram } from "@/lib/program";
import type { ParticipantAccount, RoundAccount } from "@/lib/program";
import { matchStatePda, preferencesPda } from "@/lib/pdas";
import { teeConnection } from "@/lib/tee";
import { EPHEMERAL_QUEUE, TEE_VALIDATOR } from "@/lib/constants";
import { useLocale, useT } from "@/lib/i18n";
import { classifyError } from "@/lib/errors";
import { Button, Label, Note, Panel } from "./ui";
import { useToast } from "./Toast";

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
  const { locale } = useLocale();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  // The log holds text that was already translated when it was written, so
  // switching language leaves a half-Spanish, half-English transcript on
  // screen. It is progress feedback, not a record worth keeping across that.
  useEffect(() => setLog([]), [locale]);

  const roundId = new BN(round.roundId.toString());
  const matchState = matchStatePda(round.address);
  const deadlinePassed = Date.now() / 1000 >= round.deadlineTs;

  // `close_round` needs the minimum on BOTH sides, not across them. Without
  // this the button was live on a round with one builder and no founders,
  // and pressing it produced a program refusal the operator had to decode.
  const quorum =
    round.founderCount >= round.minPerSide && round.builderCount >= round.minPerSide;
  const missing = [
    Math.max(round.minPerSide - round.founderCount, 0),
    Math.max(round.minPerSide - round.builderCount, 0),
  ];

  const say = (m: string) => {
    setLog((l) => [...l, m]);
    toast(m);
  };

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
      const msg = t.errors[classifyError(e)];
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Everything the rollup needs before a round can be settled.
   *
   * Three transactions, so there are three places a person can decline a
   * signature or lose a connection. Each step is skipped if it is already
   * done and tolerated if it fails for having been done, which makes the
   * whole thing safe to press again — the previous version always started
   * from `delegate_round` and left the round delegated with no working
   * memory and no randomness request, showing "waiting for the oracle" for
   * something nobody had asked the oracle for.
   */
  const setup = () =>
    run("setup", async () => {
      if (!delegated) {
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
      }

      const erProgram = await er();

      // The working memory is private with no members, so its existence
      // cannot be read back from here — not by anyone, including its author.
      // Creating it again is the only way to ask, and the failure is the
      // answer.
      try {
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
      } catch {
        say(t.controls.matchStateExists);
      }

      // Requested as early as possible so the oracle has the whole open
      // window to answer. `run_matching` refuses to run without it.
      if (!round.randomnessFulfilled) {
        await erProgram.methods
          .requestRoundRandomness(roundId)
          .accountsPartial({
            payer: wallet.publicKey!,
            round: round.address,
            oracleQueue: EPHEMERAL_QUEUE,
          })
          .rpc();
        say(t.controls.vrfRequested);
      }
    });

  /**
   * Close, ingest every list that exists, and run the matching.
   *
   * Resumable on purpose. The three steps are separate transactions, so any
   * of them can be the last one that lands — a dropped connection, a declined
   * signature, one bad chunk. Before, the sequence always began with
   * `close_round`, which requires status Open; a round already in Sealing
   * would fail on the first call every time, and Sealing has no other button.
   * That left a round permanently stuck with no way out of the interface.
   */
  const settle = () =>
    run("settle", async () => {
      const erProgram = await er();

      if (round.status === "open") {
        await erProgram.methods
          .closeRound(roundId)
          .accountsPartial({ round: round.address })
          .rpc();
        say(t.controls.closed);
      }

      const seal = (people: ParticipantAccount[]) =>
        erProgram.methods
          .sealPreferences(roundId)
          .accountsPartial({ round: round.address, matchState })
          .remainingAccounts(
            people.map((p) => ({
              pubkey: preferencesPda(round.address, p.wallet),
              isSigner: false,
              isWritable: false,
            })),
          )
          .rpc();

      // Which participants actually submitted a list is not knowable from
      // here: the Participant account does not record it, and the Preferences
      // account is unreadable to anyone but its owner — that is the product.
      // The previous version guessed with `slice(0, rankingCount)`, taking the
      // FIRST N participants, which is only right when the people who ranked
      // happen to be the first N in the array. Ranking is optional, so that is
      // usually false: it would either seal an account that does not exist and
      // abort, or miss one that does and never reach Matching.
      //
      // So: try the whole chunk, and if the chunk is refused, fall back to one
      // at a time and skip whoever has nothing to ingest. Same tolerance
      // `finish` already uses when closing them again.
      let ingested = 0;
      for (let i = 0; i < participants.length; i += 8) {
        const chunk = participants.slice(i, i + 8);
        try {
          await seal(chunk);
          ingested += chunk.length;
        } catch {
          for (const p of chunk) {
            try {
              await seal([p]);
              ingested++;
            } catch {
              // No list from this person, or it is already sealed.
            }
          }
        }
      }
      say(`${ingested} ${t.controls.ingested}`);

      // The round only becomes Matching once sealed_count reaches
      // ranking_count, so this is the honest check that everything got in.
      const after: any = await (erProgram.account as any).round.fetch(round.address);
      const status = Object.keys(after.status)[0];
      if (status !== "matching") {
        say(`${t.controls.sealIncomplete} (${after.sealedCount}/${after.rankingCount})`);
        return;
      }

      const started = Date.now();
      const sig = await erProgram.methods
        .runMatching(roundId, 64)
        .accountsPartial({ round: round.address, matchState })
        .rpc();
      say(`${t.controls.matched} · ${Date.now() - started} ${t.controls.wallClock}`);
      say(sig);
    });

  /**
   * Destroy the private accounts, then hand the round back to L1.
   *
   * The order is not cosmetic. Closing needs the round as its rent sponsor,
   * and once the round is committed back the rollup can no longer write it —
   * undelegating first leaves every ranking account orphaned in the enclave.
   * The button does both so nobody can get that wrong by clicking.
   */
  const finish = () =>
    run("finish", async () => {
      const erProgram = await er();

      let closed = 0;
      for (const p of participants) {
        const prefs = preferencesPda(round.address, p.wallet);
        try {
          await erProgram.methods
            .closePreferences(roundId)
            .accountsPartial({
              payer: wallet.publicKey!,
              owner: p.wallet,
              round: round.address,
              preferences: prefs,
              preferencesPermission: permissionPdaFromAccount(prefs),
            })
            .rpc();
          closed++;
        } catch {
          // Already closed, or never sealed a list. Neither is a failure.
        }
      }
      say(`${closed} ${t.controls.rankingsDestroyed}`);

      try {
        await erProgram.methods
          .closeMatchState(roundId)
          .accountsPartial({
            payer: wallet.publicKey!,
            round: round.address,
            matchState,
            matchStatePermission: permissionPdaFromAccount(matchState),
          })
          .rpc();
        say(t.controls.memoryDestroyed);
      } catch {
        /* already gone */
      }

      await erProgram.methods
        .undelegateRound(roundId)
        .accountsPartial({ payer: wallet.publicKey!, round: round.address })
        .rpc();
      say(t.controls.undelegated);
    });

  if (!wallet.publicKey || !wallet.publicKey.equals(round.authority)) {
    return null;
  }

  return (
    <Panel className="space-y-4 p-6">
      <Label>{t.controls.label}</Label>

      {/* What is done and what is missing, stated. A spinner that says
          "waiting for the oracle" when nothing was ever requested is worse
          than no status at all, because it tells the operator to wait. */}
      <ol className="space-y-1.5">
        {[
          { done: delegated, label: t.controls.stepDelegate },
          {
            done: round.randomnessFulfilled,
            label: t.controls.stepRandomness,
            pending: delegated && !round.randomnessFulfilled,
          },
          {
            done: round.status === "settled",
            label: t.controls.stepSettle,
            pending: round.status === "matching" || round.status === "sealing",
          },
        ].map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 font-mono text-2xs">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                s.done ? "bg-sealed" : s.pending ? "bg-open animate-pulse" : "bg-edgeStrong"
              }`}
              aria-hidden
            />
            <span className={s.done ? "text-chalk" : "text-muted"}>{s.label}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        {(!delegated || !round.randomnessFulfilled) && round.status === "open" && (
          <Button onClick={setup} busy={busy === "setup"}>
            {delegated ? t.controls.completeSetup : t.controls.delegate}
          </Button>
        )}
        {delegated && round.status === "open" && (
          <Button
            onClick={settle}
            busy={busy === "settle"}
            disabled={!deadlinePassed || !round.randomnessFulfilled || !quorum}
          >
            {!quorum
              ? t.controls.needsQuorum
              : deadlinePassed
                ? t.controls.settle
                : t.controls.waitingDeadline}
          </Button>
        )}
        {/* Sealing had no button at all, so a sequence that stopped halfway
            left the round with no way forward from here. */}
        {delegated && round.status === "sealing" && (
          <Button onClick={settle} busy={busy === "settle"}>
            {t.controls.resume}
          </Button>
        )}
        {delegated && round.status === "matching" && (
          <Button onClick={settle} busy={busy === "settle"}>
            {t.controls.continue}
          </Button>
        )}
        {delegated && round.status === "settled" && (
          <Button variant="ghost" onClick={finish} busy={busy === "finish"}>
            {t.controls.undelegate}
          </Button>
        )}
      </div>

      {/* Joining is an ordinary Solana transaction until the round is
          delegated and a rollup transaction afterwards — and a wallet
          simulates against L1, where a delegated account looks impossible, so
          it refuses to sign. Delegating before anyone has joined turns the
          easy half of the flow into the hard half for no reason. */}
      {!delegated && participants.length === 0 && (
        <Note>{t.controls.delegateLateHint}</Note>
      )}

      {/* The one instruction a stuck operator needs, and only when stuck. */}
      {delegated && !round.randomnessFulfilled && round.status === "open" && (
        <Note>{t.controls.setupHint}</Note>
      )}

      {/* Said as a count of people still needed, because "not enough
          participants" does not tell the operator how many to go and find. */}
      {round.status === "open" && !quorum && (
        <Note>
          {t.controls.quorumHint
            .replace("{f}", String(missing[0]))
            .replace("{b}", String(missing[1]))
            .replace("{min}", String(round.minPerSide))}
        </Note>
      )}

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
