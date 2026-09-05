"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { getProgram } from "@/lib/program";
import { roundPda } from "@/lib/pdas";
import { Button, Note, Panel } from "./ui";

export function CreateRound() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(10);
  const [transparent, setTransparent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!wallet.publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const program = getProgram(connection, wallet as any);
      const roundId = new BN(Date.now());
      const round = roundPda(wallet.publicKey, roundId);
      const deadline = new BN(Math.floor(Date.now() / 1000) + minutes * 60);

      await program.methods
        .initRound(roundId, deadline, 2, transparent)
        .accountsPartial({
          authority: wallet.publicKey,
          round,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      router.push(`/round/${round.toBase58()}`);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Crear ronda
      </Button>
    );
  }

  return (
    <Panel className="w-full max-w-md space-y-4 p-5">
      <div className="space-y-2">
        <label className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Cierra en
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="h-9 w-24 rounded-md border border-edge bg-ink px-3 font-mono text-[13px] outline-none focus:border-muted"
          />
          <span className="font-mono text-[12px] text-muted">minutos</span>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={transparent}
          onChange={(e) => setTransparent(e.target.checked)}
          className="mt-1 accent-[#f0a742]"
        />
        <span className="space-y-1">
          <span className="block font-mono text-[12px] text-open">
            Ronda transparente
          </span>
          {/* This is a disclosure, not a display toggle. It has to read like one. */}
          <span className="block text-[12px] leading-relaxed text-muted">
            Publica los estados intermedios para poder ver el algoritmo correr.
            Eso revela quién propuso a quién y en qué orden, lo que reconstruye
            buena parte de los rankings. Úsala solo para demos o cuando todos
            los participantes lo acepten.
          </span>
        </span>
      </label>

      {error && (
        <p className="font-mono text-[11px] leading-relaxed text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={create} busy={busy} disabled={!wallet.publicKey}>
          {wallet.publicKey ? "Crear" : "Conecta tu wallet"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
      <Note>Devnet. No se mueve dinero real.</Note>
    </Panel>
  );
}
