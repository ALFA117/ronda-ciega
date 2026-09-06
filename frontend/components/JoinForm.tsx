"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { getProgram } from "@/lib/program";
import { teeConnection } from "@/lib/tee";
import { participantPda } from "@/lib/pdas";
import { Side } from "@/lib/constants";
import { RoundAccount } from "@/lib/program";
import { useT } from "@/lib/i18n";
import { classifyError } from "@/lib/errors";
import { Button, Label, Note, Panel } from "./ui";

export function JoinForm({
  round,
  delegated,
  onJoined,
}: {
  round: RoundAccount;
  /** Once the round is delegated its account lives on the rollup, so a join
   *  has to be sent there. Addressed to L1 it targets an account L1 no longer
   *  owns: the wallet simulates it, sees a failure it cannot explain, and
   *  blocks the signature — which is what a user actually experiences. */
  delegated: boolean;
  onJoined: () => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const t = useT();
  const [side, setSide] = useState<Side>("founder");
  const [handle, setHandle] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (!wallet.publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const conn = delegated
        ? await teeConnection(wallet.publicKey, (m) => wallet.signMessage!(m))
        : connection;
      const program = getProgram(conn, wallet as any);
      await program.methods
        .joinRound(
          new BN(round.roundId.toString()),
          side === "founder" ? { founder: {} } : { builder: {} },
          handle.trim(),
          link.trim(),
        )
        .accountsPartial({
          wallet: wallet.publicKey,
          round: round.address,
          participant: participantPda(round.address, wallet.publicKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      onJoined();
    } catch (e: any) {
      setError(t.errors[classifyError(e)]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="space-y-5 p-6">
      <div className="space-y-2">
        <Label>{t.join.sideLabel}</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["founder", "builder"] as Side[]).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`rounded-md border p-4 text-left transition ${
                side === s
                  ? "border-sealed/50 bg-sealed/10"
                  : "border-edge hover:border-edgeStrong"
              }`}
            >
              <div className="font-mono text-sm">{s === "founder" ? t.join.founder : t.join.builder}</div>
              <div className="mt-1 text-xs leading-relaxed text-muted">
                {s === "founder" ? t.join.founderBlurb : t.join.builderBlurb}
              </div>
            </button>
          ))}
        </div>
        <Note>
          {t.join.sideNote}
        </Note>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t.join.handle}</Label>
          <input
            value={handle}
            maxLength={32}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@tu_handle"
            className="glass h-11 w-full rounded-xl px-3.5 font-mono text-[16px] text-chalk outline-none placeholder:text-dim sm:h-10 sm:text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label>{t.join.link}</Label>
          <input
            value={link}
            maxLength={96}
            onChange={(e) => setLink(e.target.value)}
            placeholder="github.com/…"
            className="glass h-11 w-full rounded-xl px-3.5 font-mono text-[16px] text-chalk outline-none placeholder:text-dim sm:h-10 sm:text-sm"
          />
        </div>
      </div>

      <Note>
        {t.join.profileNote}
      </Note>

      {error && (
        <p className="font-mono text-2xs leading-relaxed text-red-400">
          {error}
        </p>
      )}

      <Button
        onClick={join}
        busy={busy}
        disabled={!wallet.publicKey || handle.trim().length === 0}
      >
        {wallet.publicKey ? t.join.submit : t.join.connect}
      </Button>
    </Panel>
  );
}
