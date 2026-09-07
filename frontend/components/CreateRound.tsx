"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { getProgram } from "@/lib/program";
import { classifyError } from "@/lib/errors";
import { roundPda } from "@/lib/pdas";
import { useT } from "@/lib/i18n";
import {
  checkMinutes,
  MAX_MINUTES,
  MIN_MINUTES,
  minutesToSeconds,
} from "@/lib/duration";
import { Button, ErrorText, Note, Panel } from "./ui";

export function CreateRound() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);
  // The raw string, not a number. Number("") is 0 and Number("abc") is NaN,
  // and both of those used to reach the deadline: the first as "closes now",
  // the second as 1970, because new BN(NaN).toString() is "0" rather than a
  // throw. Keeping the text lets the check see an empty box as empty.
  const [minutes, setMinutes] = useState("10");
  const [transparent, setTransparent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!wallet.publicKey || minutesError) return;
    setBusy(true);
    setError(null);
    try {
      const program = getProgram(connection, wallet as any);
      const roundId = new BN(Date.now());
      const round = roundPda(wallet.publicKey, roundId);
      const deadline = new BN(
        Math.floor(Date.now() / 1000) + minutesToSeconds(minutes),
      );

      await program.methods
        .initRound(roundId, deadline, 2, transparent)
        .accountsPartial({
          authority: wallet.publicKey,
          round,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      router.push(`/round/${round.toBase58()}`);
    } catch (e) {
      setError(t.errors[classifyError(e)]);
    } finally {
      setBusy(false);
    }
  }

  const minutesError = checkMinutes(minutes);

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {t.rounds.create}
      </Button>
    );
  }

  return (
    <Panel className="w-full max-w-md space-y-4 p-5">
      <div className="space-y-2">
        <label className="font-mono text-2xs uppercase tracking-widest text-muted">
          {t.create.closesIn}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            aria-invalid={minutesError ? true : undefined}
            aria-describedby={minutesError ? "closes-in-error" : undefined}
            className={`glass h-11 w-24 rounded-xl px-3.5 font-mono text-[16px] text-chalk outline-none placeholder:text-dim sm:h-10 sm:text-sm ${
              minutesError ? "ring-1 ring-open" : ""
            }`}
          />
          <span className="font-mono text-xs text-muted">{t.create.minutes}</span>
        </div>
        {/* Said here rather than after the transaction, because the program
            accepts a deadline in the past perfectly happily — it just makes a
            round nobody can ever join, with nothing on screen to explain it. */}
        {minutesError && (
          <div id="closes-in-error">
            <ErrorText>{t.create.errors[minutesError]}</ErrorText>
          </div>
        )}
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={transparent}
          onChange={(e) => setTransparent(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[color:var(--open)]"
        />
        <span className="space-y-1">
          <span className="block font-mono text-xs text-open">
            {t.create.transparent}
          </span>
          {/* This is a disclosure, not a display toggle. It has to read like one. */}
          <span className="block text-xs leading-relaxed text-muted">
            {t.create.transparentNote}
          </span>
        </span>
      </label>

      {error && (
        <p className="font-mono text-2xs leading-relaxed text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          onClick={create}
          busy={busy}
          disabled={!wallet.publicKey || !!minutesError}
        >
          {wallet.publicKey ? t.create.submit : t.join.connect}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {t.create.cancel}
        </Button>
      </div>
      <Note>{t.create.devnetNote}</Note>
    </Panel>
  );
}
