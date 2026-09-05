"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import BN from "bn.js";
import { permissionPdaFromAccount } from "@magicblock-labs/ephemeral-rollups-sdk";
import { getProgram, ParticipantAccount, RoundAccount } from "@/lib/program";
import { participantPda, preferencesPda } from "@/lib/pdas";
import { teeConnection } from "@/lib/tee";
import { Button, Label, Note, Panel } from "./ui";

export function RankingBuilder({
  round,
  me,
  participants,
  onSubmitted,
}: {
  round: RoundAccount;
  me: ParticipantAccount;
  participants: ParticipantAccount[];
  onSubmitted: () => void;
}) {
  const wallet = useWallet();
  const others = participants
    .filter((p) => p.side !== me.side)
    .sort((a, b) => a.index - b.index);

  const [ranking, setRanking] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (idx: number) =>
    setRanking((r) =>
      r.includes(idx) ? r.filter((v) => v !== idx) : [...r, idx],
    );

  async function submit() {
    if (!wallet.publicKey || !wallet.signMessage) return;
    setBusy(true);
    setError(null);
    try {
      // This signature is the moment the enclave learns who you are. It is also
      // the reason nobody else can read what you are about to write.
      const conn = await teeConnection(wallet.publicKey, (m) =>
        wallet.signMessage!(m),
      );
      const program = getProgram(conn, wallet as any);
      const preferences = preferencesPda(round.address, wallet.publicKey);

      await program.methods
        .submitRanking(new BN(round.roundId.toString()), Buffer.from(ranking))
        .accountsPartial({
          wallet: wallet.publicKey,
          round: round.address,
          participant: participantPda(round.address, wallet.publicKey),
          preferences,
          preferencesPermission: permissionPdaFromAccount(preferences),
        })
        .rpc();

      setDone(true);
      onSubmitted();
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Panel sealed className="space-y-3 p-6">
        <Label>Lista sellada</Label>
        <Note>
          Tu ranking está en una cuenta que solo tu wallet puede leer. No hay
          instrucción en el programa que la revele, ni al cerrar la ronda ni
          después. Puedes reemplazarla mientras la ronda siga abierta.
        </Note>
        <Button variant="ghost" onClick={() => setDone(false)}>
          Cambiar mi lista
        </Button>
      </Panel>
    );
  }

  return (
    <Panel sealed className="space-y-5 p-6">
      <div className="space-y-2">
        <Label>Tu ranking privado</Label>
        <Note>
          Toca en orden, del que más quieres al que menos. Puedes dejar gente
          fuera: no listar a alguien es decir que prefieres quedarte sin par.
        </Note>
      </div>

      <div className="grid gap-2">
        {others.map((p) => {
          const pos = ranking.indexOf(p.index);
          const chosen = pos >= 0;
          return (
            <button
              key={p.address.toBase58()}
              onClick={() => toggle(p.index)}
              className={`flex items-center gap-3 rounded-md border px-4 py-3 text-left transition ${
                chosen
                  ? "border-sealed/50 bg-sealed/10"
                  : "border-edge hover:border-muted"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-[11px] ${
                  chosen ? "bg-sealed text-ink" : "border border-edge text-muted"
                }`}
              >
                {chosen ? pos + 1 : "·"}
              </span>
              <span className="font-mono text-[13px]">{p.handle}</span>
              {p.link && (
                <span className="ml-auto truncate font-mono text-[11px] text-muted">
                  {p.link}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {others.length === 0 && (
        <Note>Todavía no hay nadie del otro lado a quien rankear.</Note>
      )}

      {error && (
        <p className="font-mono text-[11px] leading-relaxed text-red-400">
          {error}
        </p>
      )}

      <Button onClick={submit} busy={busy} disabled={ranking.length === 0}>
        Sellar mi lista
      </Button>
    </Panel>
  );
}
