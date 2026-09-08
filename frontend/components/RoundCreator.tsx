"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import dynamic from "next/dynamic";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import BN from "bn.js";
import { getProgram } from "@/lib/program";
import { roundPda } from "@/lib/pdas";
import { classifyError } from "@/lib/errors";
import { useT } from "@/lib/i18n";
import {
  checkMinutes,
  MAX_MINUTES,
  MIN_MINUTES,
  minutesToSeconds,
} from "@/lib/duration";
import { firstUnanswered, stepState } from "@/lib/flow";
import { Rail } from "./Flow";
import { Button, ErrorText } from "./ui";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false, loading: () => <div className="glass h-11 w-[150px] rounded-xl" /> },
);

/** What the signature is doing. Each of these is something we actually know. */
type Phase = "idle" | "signing" | "confirming" | "done";

/**
 * Opening a round, as a rail you descend.
 *
 * There were two copies of this: a form inside the start panel and another
 * behind a button at the bottom of the page, each with its own `create()`,
 * its own validation and its own idea of what to say afterwards. They have
 * been one component since — the page shows it in one place.
 *
 * The shape is the point. A box, a checkbox and a button said nothing about
 * how much was left or that a signature was coming; the signature arrived as
 * a surprise, which is the worst way for a wallet to open. Drawn as the same
 * numbered nodes the map at the top uses, it says there are three answers,
 * which are behind you, and that the third one is signed — and then it keeps
 * reporting: the wallet is up, the network is confirming, the round is open.
 *
 * The two phases are split because they are separately knowable. `.rpc()`
 * resolves once, after confirmation, so a single await could only ever say
 * one thing for both — and "signing" is a lie the whole time the network is
 * confirming. Sending and confirming as two calls is what buys the honest
 * second line.
 */
export function RoundCreator({ onCancel }: { onCancel?: () => void }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const router = useRouter();
  const t = useT();

  // The raw string, not a number. See lib/duration.ts: Number("") is 0 and
  // Number("abc") is NaN, and new BN(NaN).toString() is "0" — an empty box
  // used to create a round dated 1970 with nothing on screen to say so.
  const [minutes, setMinutes] = useState("10");
  const [transparent, setTransparent] = useState(true);
  const [chose, setChose] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const connected = !!wallet.publicKey;
  const minutesError = checkMinutes(minutes);
  const busy = phase === "signing" || phase === "confirming";

  const answered = [!minutesError, chose, phase === "done"];
  const active = firstUnanswered(answered);
  const doneSteps = answered.flatMap((a, i) => (a ? [i] : []));

  async function create() {
    if (!wallet.publicKey || minutesError || busy) return;
    setError(null);
    setPhase("signing");
    try {
      const program = getProgram(connection, wallet as any);
      const roundId = new BN(Date.now());
      const round = roundPda(wallet.publicKey, roundId);
      const deadline = new BN(
        Math.floor(Date.now() / 1000) + minutesToSeconds(minutes),
      );

      const tx = await program.methods
        .initRound(roundId, deadline, 2, transparent)
        .accountsPartial({
          authority: wallet.publicKey,
          round,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      // Pin the blockhash we send with, so the confirmation waits on the
      // right one instead of a fresher one the transaction never used.
      const latest = await connection.getLatestBlockhash();
      tx.recentBlockhash = latest.blockhash;
      tx.feePayer = wallet.publicKey;

      const signature = await wallet.sendTransaction(tx, connection);
      setPhase("confirming");
      await connection.confirmTransaction(
        { signature, ...latest },
        "confirmed",
      );

      setPhase("done");
      router.push(`/round/${round.toBase58()}`);
    } catch (e) {
      setError(t.errors[classifyError(e)]);
      setPhase("idle");
    }
  }

  const r = t.create.rail;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-medium tracking-tight">{r.title}</h2>
        <p className="text-xs text-muted">{r.lede}</p>
      </div>

      <Rail
        steps={[
          {
            ...r.steps[0],
            state: stepState(0, active, doneSteps),
            answer: minutesError
              ? undefined
              : r.answered.window.replace("{n}", minutes.trim()),
            children: (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    id="closes-in"
                    type="number"
                    inputMode="numeric"
                    min={MIN_MINUTES}
                    max={MAX_MINUTES}
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    aria-label={t.create.closesIn}
                    aria-invalid={minutesError ? true : undefined}
                    aria-describedby={minutesError ? "closes-in-error" : undefined}
                    className={`glass h-11 w-24 rounded-xl px-3.5 font-mono text-[16px] text-chalk outline-none placeholder:text-dim sm:text-sm ${
                      minutesError ? "ring-1 ring-open" : ""
                    }`}
                  />
                  <span className="font-mono text-xs text-muted">
                    {t.create.minutes}
                  </span>
                </div>
                {/* Said here rather than after the transaction: the program
                    accepts a past deadline happily, it just makes a round
                    nobody can ever join. */}
                {minutesError && (
                  <div id="closes-in-error">
                    <ErrorText>{t.create.errors[minutesError]}</ErrorText>
                  </div>
                )}
              </div>
            ),
          },
          {
            ...r.steps[1],
            state: stepState(1, active, doneSteps),
            answer: chose
              ? transparent
                ? r.answered.transparent
                : r.answered.private
              : undefined,
            children: (
              <Visibility
                value={transparent}
                onChange={(v) => {
                  setTransparent(v);
                  setChose(true);
                }}
              />
            ),
          },
          {
            ...r.steps[2],
            state: stepState(2, active, doneSteps),
            children: (
              <div className="space-y-3">
                {error && (
                  <p
                    role="alert"
                    className="rounded-xl border border-open/40 bg-open/[0.06] px-3.5 py-3 text-xs leading-relaxed text-chalk/90"
                  >
                    {error}
                  </p>
                )}

                {connected ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={create}
                      busy={busy}
                      disabled={!!minutesError || phase === "done"}
                    >
                      {t.create.submit}
                    </Button>
                    <Progress phase={phase} r={r} />
                    {onCancel && !busy && (
                      <Button variant="ghost" onClick={onCancel}>
                        {t.create.cancel}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <WalletMultiButton />
                    <span className="font-mono text-2xs text-muted">{r.connect}</span>
                  </div>
                )}

                <p className="font-mono text-2xs text-dim">{t.create.devnetNote}</p>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

/**
 * The disclosure, as a choice between two named things.
 *
 * It was a checkbox with a paragraph beside it, and a checkbox says "an
 * option you may tick" for what is a decision about whose preferences get
 * reconstructed. Two cards make both outcomes visible at once, and the one
 * that leaks says so in its own words rather than in the small print of the
 * other.
 */
function Visibility({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useT();
  const options = [
    { on: true, Icon: Eye, title: t.create.transparent, body: t.create.transparentNote },
    { on: false, Icon: EyeOff, title: t.create.private, body: t.create.privateNote },
  ];

  return (
    <div role="radiogroup" aria-label={t.create.transparent} className="grid gap-2 sm:grid-cols-2">
      {options.map(({ on, Icon, title, body }) => {
        const picked = value === on;
        return (
          <button
            key={String(on)}
            type="button"
            role="radio"
            aria-checked={picked}
            onClick={() => onChange(on)}
            className={`rounded-xl border p-3.5 text-left transition-colors ${
              picked
                ? on
                  ? "border-open/60 bg-open/[0.07]"
                  : "border-sealed/60 bg-sealed/[0.07]"
                : "border-edge bg-surface/50 hover:border-edgeStrong"
            }`}
          >
            <span
              className={`flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.14em] ${
                picked ? (on ? "text-open" : "text-sealed") : "text-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {title}
            </span>
            <span className="mt-2 block text-xs leading-relaxed text-muted">{body}</span>
          </button>
        );
      })}
    </div>
  );
}

/** What the signature is doing, said while it does it. */
function Progress({
  phase,
  r,
}: {
  phase: Phase;
  r: { signing: string; confirming: string; done: string };
}) {
  if (phase === "idle") return null;
  const label =
    phase === "signing" ? r.signing : phase === "confirming" ? r.confirming : r.done;
  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-2 font-mono text-2xs ${
        phase === "done" ? "text-sealed" : "text-muted"
      }`}
    >
      {phase !== "done" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {label}
    </span>
  );
}
