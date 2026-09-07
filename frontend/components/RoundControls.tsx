"use client";

import { useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import BN from "bn.js";
import { LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js";
import { permissionPdaFromAccount } from "@magicblock-labs/ephemeral-rollups-sdk";
import { getProgram } from "@/lib/program";
import type { ParticipantAccount, RoundAccount } from "@/lib/program";
import { matchStatePda, preferencesPda } from "@/lib/pdas";
import { teeConnection } from "@/lib/tee";
import {
  OPERATOR_MIN_SOL,
  OPERATOR_TOPUP_SOL,
  operatorKey,
  type OperatorKey,
} from "@/lib/operator-key";
import { EPHEMERAL_QUEUE, TEE_VALIDATOR } from "@/lib/constants";
import { useLocale, useT } from "@/lib/i18n";
import { classifyError } from "@/lib/errors";
import { hasQuorum, plan, shouldRetrySetup, type AutoAction } from "@/lib/autopilot";
import { Button, Label, Note, Panel } from "./ui";
import { useToast } from "./Toast";

/**
 * How often the autopilot looks at the round.
 *
 * Slow on purpose: every idle tick is one RPC read, and the two things it
 * waits for — a deadline and a VRF callback — are not worth polling harder
 * than this. A settle that lands six seconds late is a settle that landed.
 */
const AUTOPILOT_TICK_MS = 6000;

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
  const [auto, setAuto] = useState(false);

  // Guards for the autopilot loop. Refs rather than state because the loop
  // reads them on a timer and must see the current value, not the one that
  // was captured when the interval was scheduled.
  const running = useRef(false);
  const failures = useRef(0);
  const lastSetupAt = useRef<number | null>(null);

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
  //
  // Imported rather than rewritten: this panel and the autopilot were deciding
  // the same thing from two copies of the rule, which is how the copy without
  // the fix survives a fix.
  const quorum = hasQuorum({
    founderCount: round.founderCount,
    builderCount: round.builderCount,
    minPerSide: round.minPerSide,
  });
  const missing = [
    Math.max(round.minPerSide - round.founderCount, 0),
    Math.max(round.minPerSide - round.builderCount, 0),
  ];

  const say = (m: string) => {
    setLog((l) => [...l, m]);
    toast(m);
  };

  /**
   * A rollup client that never asks the wallet for anything.
   *
   * The TEE auth challenge is signed by the local key too, so even proving
   * who is connecting costs no prompt. Nothing this client sends checks the
   * signer against the round authority, so the identity it uses is only ever
   * "whoever paid".
   */
  /**
   * Put a little SOL on the local key, if it needs it.
   *
   * This is the one wallet prompt the operator flow still costs, and it is a
   * plain transfer on L1 — a wallet can simulate that perfectly well and
   * signs it without complaint. Everything the round then does on the rollup
   * is paid for from here, silently.
   */
  async function ensureFunded(op: OperatorKey) {
    const balance = await connection.getBalance(op.publicKey);
    if (balance >= OPERATOR_MIN_SOL * LAMPORTS_PER_SOL) return;
    if (!wallet.publicKey || !wallet.sendTransaction) return;

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: op.publicKey,
        lamports: Math.round(OPERATOR_TOPUP_SOL * LAMPORTS_PER_SOL),
      }),
    );
    const sig = await wallet.sendTransaction(tx, connection);
    await connection.confirmTransaction(sig, "confirmed");
    say(t.controls.operatorFunded);
  }

  async function er() {
    const op = operatorKey();
    await ensureFunded(op);
    const conn = await teeConnection(op.publicKey, op.signMessage);
    return { program: getProgram(conn, op as any), op };
  }

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError(null);
    try {
      await fn();
      failures.current = 0;
      onDone();
    } catch (e: any) {
      const msg = t.errors[classifyError(e)];
      // Counted so the autopilot can give up rather than retry a permanent
      // refusal every few seconds until the operator key runs dry.
      failures.current += 1;
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

      const { program: erProgram, op } = await er();

      // The working memory is private with no members, so its existence
      // cannot be read back from here — not by anyone, including its author.
      // Creating it again is the only way to ask, and the failure is the
      // answer.
      try {
        await erProgram.methods
          .initMatchState(roundId)
          .accountsPartial({
            payer: op.publicKey,
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
            payer: op.publicKey,
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
      const { program: erProgram, op } = await er();

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
      const { program: erProgram, op } = await er();

      let closed = 0;
      for (const p of participants) {
        const prefs = preferencesPda(round.address, p.wallet);
        try {
          await erProgram.methods
            .closePreferences(roundId)
            .accountsPartial({
              payer: op.publicKey,
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
            payer: op.publicKey,
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
        .accountsPartial({ payer: op.publicKey, round: round.address })
        .rpc();
      say(t.controls.undelegated);
    });

  /**
   * The autopilot.
   *
   * Everything it does, the operator was already doing by hand with the same
   * local key and the same instructions — this only removes the requirement
   * that a person be awake when the deadline passes. It runs whatever
   * `plan` says is possible, and otherwise re-reads the round so the wait
   * ends by itself.
   *
   * It is deliberately not a background service. A browser tab is the only
   * thing running it, and the UI says so: a round left half-settled by a
   * closed laptop is recoverable, but only if nobody was told otherwise.
   */
  const step = async () => {
    if (running.current) return;

    const p = plan({
      status: round.status,
      delegated,
      randomnessFulfilled: round.randomnessFulfilled,
      founderCount: round.founderCount,
      builderCount: round.builderCount,
      minPerSide: round.minPerSide,
      deadlineTs: round.deadlineTs,
      now: Date.now() / 1000,
    });

    if (p.done) {
      setAuto(false);
      say(t.autopilot.doneAll);
      return;
    }

    // Three refusals in a row is a round that needs a person, not another
    // attempt. Disarming is louder than a toast nobody is there to read.
    if (failures.current >= 3) {
      setAuto(false);
      say(t.autopilot.stopped);
      return;
    }

    let action: AutoAction | null = p.action;

    // A randomness request can be lost. Re-sending setup is the only way to
    // ask again, and it is rate-limited so a stuck oracle does not drain the
    // operator key one duplicate request at a time.
    if (!action && shouldRetrySetup(p.waiting, lastSetupAt.current, Date.now())) {
      action = "setup";
      say(t.autopilot.retrying);
    }

    if (!action) {
      // Nothing to send. Re-read the round so a deadline or a callback that
      // has landed since the last tick is noticed.
      onDone();
      return;
    }

    running.current = true;
    try {
      if (action === "setup") lastSetupAt.current = Date.now();
      say(`${t.autopilot.running}: ${action}`);
      if (action === "setup") await setup();
      else if (action === "settle") await settle();
      else await finish();
    } finally {
      running.current = false;
    }
  };

  // The latest-ref pattern, and it is load-bearing rather than tidy.
  //
  // The first version made step a useCallback over round and listed it in
  // the effect deps. round is a fresh object on every refresh, so every tick
  // produced a new step, which tore down and rebuilt the interval, which ran
  // step immediately, which called onDone to refresh — a loop spinning as
  // fast as devnet answers, on the operator key, sending real transactions.
  // Holding the closure in a ref keeps the interval tied to auto alone.
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    if (!auto) return;
    const tick = () => void stepRef.current();
    tick();
    const id = window.setInterval(tick, AUTOPILOT_TICK_MS);
    return () => window.clearInterval(id);
  }, [auto]);

  // Turning it on resets the failure count, so "read the error and turn it
  // back on" actually works rather than disarming again on the next tick.
  const arm = (on: boolean) => {
    if (on) failures.current = 0;
    setAuto(on);
  };

  if (!wallet.publicKey || !wallet.publicKey.equals(round.authority)) {
    return null;
  }

  const current = plan({
    status: round.status,
    delegated,
    randomnessFulfilled: round.randomnessFulfilled,
    founderCount: round.founderCount,
    builderCount: round.builderCount,
    minPerSide: round.minPerSide,
    deadlineTs: round.deadlineTs,
    now: Date.now() / 1000,
  });

  const waitingText = current.done
    ? t.autopilot.doneAll
    : current.waiting === "deadline"
      ? t.autopilot.waitingDeadline
      : current.waiting === "randomness"
        ? t.autopilot.waitingRandomness
        : current.waiting === "quorum"
          ? t.autopilot.waitingQuorum
          : null;

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

      {/* One switch instead of three appointments.
          Every step below is already sent by the local key, which asks the
          wallet for nothing — so the only thing that ever required a person
          here was the click. This does the clicking. */}
      {!current.done && (
        <div
          className={`rounded-xl border p-4 transition-colors ${
            auto ? "border-sealed/40 bg-sealed/[0.06]" : "border-edge"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    auto
                      ? current.stalled
                        ? "bg-open"
                        : "bg-sealed animate-pulse"
                      : "bg-edgeStrong"
                  }`}
                />
                <span className="font-mono text-2xs uppercase tracking-[0.14em] text-chalk">
                  {t.autopilot.label}
                </span>
                {auto && (
                  <span className="font-mono text-2xs text-sealed">
                    {t.autopilot.on}
                  </span>
                )}
              </div>
              <p className="max-w-prose text-xs leading-relaxed text-muted">
                {auto && waitingText ? waitingText : t.autopilot.help}
              </p>
            </div>

            <Button
              variant={auto ? "ghost" : "sealed"}
              onClick={() => arm(!auto)}
            >
              {auto ? t.autopilot.disable : t.autopilot.enable}
            </Button>
          </div>

          {/* Said while it is on, not buried in a tooltip. Someone who thinks
              this keeps running after they close the laptop will come back to
              a round they believe settled and find it did not. */}
          {auto && (
            <p className="mt-3 border-t border-edge pt-3 font-mono text-2xs leading-relaxed text-dim">
              {t.autopilot.tabWarning}
            </p>
          )}
        </div>
      )}

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

      {/* Who is signing what, said plainly. A key that runs the round from
          inside the browser should never be a surprise. */}
      {delegated && <Note>{t.controls.operatorNote}</Note>}

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
