"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { getProgram } from "@/lib/program";
import { participantPda } from "@/lib/pdas";
import { SIDE_BLURB, SIDE_LABEL, Side } from "@/lib/constants";
import { RoundAccount } from "@/lib/program";
import { Button, Label, Note, Panel } from "./ui";

export function JoinForm({
  round,
  onJoined,
}: {
  round: RoundAccount;
  onJoined: () => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
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
      const program = getProgram(connection, wallet as any);
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
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="space-y-5 p-6">
      <div className="space-y-2">
        <Label>Tu lado del mercado</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["founder", "builder"] as Side[]).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`rounded-md border p-4 text-left transition ${
                side === s
                  ? "border-chalk/40 bg-chalk/5"
                  : "border-edge hover:border-muted"
              }`}
            >
              <div className="font-mono text-[13px]">{SIDE_LABEL[s]}</div>
              <div className="mt-1 text-[12px] leading-relaxed text-muted">
                {SIDE_BLURB[s]}
              </div>
            </button>
          ))}
        </div>
        <Note>
          Los founders proponen y los builders eligen. Eso hace el resultado
          óptimo para los founders — es una propiedad del algoritmo, y se dice
          aquí en vez de esconderla.
        </Note>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Handle</Label>
          <input
            value={handle}
            maxLength={32}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@tu_handle"
            className="h-9 w-full rounded-md border border-edge bg-ink px-3 font-mono text-[13px] outline-none focus:border-muted"
          />
        </div>
        <div className="space-y-2">
          <Label>Link</Label>
          <input
            value={link}
            maxLength={96}
            onChange={(e) => setLink(e.target.value)}
            placeholder="github.com/…"
            className="h-9 w-full rounded-md border border-edge bg-ink px-3 font-mono text-[13px] outline-none focus:border-muted"
          />
        </div>
      </div>

      <Note>
        Tu perfil es público. Lo privado nunca es quién eres, solo a quién
        quieres.
      </Note>

      {error && (
        <p className="font-mono text-[11px] leading-relaxed text-red-400">
          {error}
        </p>
      )}

      <Button
        onClick={join}
        busy={busy}
        disabled={!wallet.publicKey || handle.trim().length === 0}
      >
        {wallet.publicKey ? "Entrar a la ronda" : "Conecta tu wallet"}
      </Button>
    </Panel>
  );
}
