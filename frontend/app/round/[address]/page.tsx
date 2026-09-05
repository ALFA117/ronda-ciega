"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useRound } from "@/hooks/useRound";
import { JoinForm } from "@/components/JoinForm";
import { RankingBuilder } from "@/components/RankingBuilder";
import { RoundControls } from "@/components/RoundControls";
import { MatchTheater } from "@/components/MatchTheater";
import { Explorer, Label, Note, Panel, StatusPill } from "@/components/ui";

export default function RoundPage({ params }: { params: { address: string } }) {
  const wallet = useWallet();
  const { round, participants, delegated, loading, error, refresh } = useRound(
    params.address,
  );

  if (loading) return <Note>Cargando la ronda…</Note>;
  if (error || !round)
    return (
      <Panel className="p-6">
        <p className="font-mono text-[12px] text-red-400">
          {error || "Ronda no encontrada"}
        </p>
      </Panel>
    );

  const me = participants.find(
    (p) => wallet.publicKey && p.wallet.equals(wallet.publicKey),
  );
  const founders = participants.filter((p) => p.side === "founder");
  const builders = participants.filter((p) => p.side === "builder");
  const showTheater = round.status === "settled" || round.tick > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <h1 className="font-mono text-[15px]">
              Ronda #{round.roundId.toString().slice(-6)}
            </h1>
            <StatusPill status={round.status} />
            {round.transparent && (
              <span className="rounded border border-open/40 px-2 py-0.5 font-mono text-[11px] text-open">
                transparente
              </span>
            )}
            {delegated && (
              <span className="rounded border border-sealed/40 px-2 py-0.5 font-mono text-[11px] text-sealed">
                en el rollup
              </span>
            )}
          </div>
          <div className="font-mono text-[11px] text-muted">
            {founders.length} founders · {builders.length} builders ·{" "}
            <span className="text-sealed">
              {round.rankingCount} listas selladas
            </span>
          </div>
        </div>
        <Explorer address={round.address.toBase58()} />
      </div>

      {round.transparent && (
        <Panel className="border-open/25 p-4">
          <Note>
            <span className="text-open">Ronda transparente.</span> Publica los
            estados intermedios del algoritmo, lo que revela quién propuso a
            quién y en qué orden. Las listas completas siguen selladas, pero
            esta ronda no da la garantía completa — por eso es solo para demos.
          </Note>
        </Panel>
      )}

      {showTheater && (
        <MatchTheater round={round} participants={participants} />
      )}

      <RoundControls
        round={round}
        participants={participants}
        delegated={delegated}
        onDone={refresh}
      />

      {round.status === "open" && !me && (
        <JoinForm round={round} onJoined={refresh} />
      )}

      {round.status === "open" && me && delegated && (
        <RankingBuilder
          round={round}
          me={me}
          participants={participants}
          onSubmitted={refresh}
        />
      )}

      {round.status === "open" && me && !delegated && (
        <Panel className="p-6">
          <Note>
            Estás dentro como{" "}
            <span className="text-chalk">{me.handle}</span>. Espera a que quien
            organiza delegue la ronda al rollup — tu lista privada no puede
            existir hasta entonces.
          </Note>
        </Panel>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {(["founder", "builder"] as const).map((side) => (
          <div key={side} className="space-y-3">
            <Label>{side === "founder" ? "Founders" : "Builders"}</Label>
            <div className="space-y-1.5">
              {participants
                .filter((p) => p.side === side)
                .map((p) => (
                  <div
                    key={p.address.toBase58()}
                    className="flex items-center gap-2 font-mono text-[12px]"
                  >
                    <span className="w-5 text-muted">{p.index}</span>
                    <span>{p.handle}</span>
                    {me && p.wallet.equals(me.wallet) && (
                      <span className="text-[10px] text-muted">(tú)</span>
                    )}
                  </div>
                ))}
              {participants.filter((p) => p.side === side).length === 0 && (
                <Note>Nadie todavía.</Note>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
