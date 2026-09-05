"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Connection } from "@solana/web3.js";
import { DEVNET_RPC } from "@/lib/constants";
import { decodeRound, getReadProgram, RoundAccount } from "@/lib/program";
import { Explorer, Label, Note, Panel, StatusPill } from "@/components/ui";
import { CreateRound } from "@/components/CreateRound";

export default function Home() {
  const [rounds, setRounds] = useState<RoundAccount[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const program = getReadProgram(new Connection(DEVNET_RPC, "confirmed"));
        const raw = await (program.account as any).round.all();
        const decoded = raw
          .map((r: any) => decodeRound(r.publicKey, r.account))
          .sort((a: RoundAccount, b: RoundAccount) =>
            Number(b.roundId - a.roundId),
          );
        setRounds(decoded);
      } catch {
        setRounds([]);
      }
    })();
  }, []);

  return (
    <div className="space-y-16">
      <section className="max-w-2xl space-y-6">
        <h1 className="text-4xl font-medium leading-[1.1] tracking-tight">
          Dices a quién quieres
          <br />
          <span className="text-muted">sin que nadie sepa que lo dijiste.</span>
        </h1>
        <div className="space-y-4 text-[15px] leading-relaxed text-chalk/80">
          <p>
            Emparejar cofundadores es un mercado de sinceridad rota. Todos
            tienen un ranking mental y casi nadie lo declara, porque declararlo
            solo cuesta si el otro no corresponde.
          </p>
          <p>
            Gale–Shapley resolvió esto en 1962, pero necesita un tercero de
            confianza que reciba todas las listas y no las filtre. Aquí ese
            tercero es un{" "}
            <span className="text-sealed">Private Ephemeral Rollup</span>: las
            listas viven en cuentas que solo su autor puede leer, el algoritmo
            corre dentro del enclave, y lo único que se publica son los pares
            finales.
          </p>
        </div>
      </section>

      <section className="max-w-2xl space-y-4">
        <Label>Por qué no es un commit-reveal</Label>
        <Note>
          Un commit-reveal compra secreto <em>hasta un deadline</em>: verificar
          exige publicar el preimagen. Una lista de preferencias tiene que
          quedar secreta <em>para siempre</em> — si al final se publica que te
          puse en el puesto siete, el costo social que el mecanismo prometía
          quitar solo llegó tarde. Por eso hace falta cómputo real sobre estado
          que nadie de fuera puede leer.
        </Note>
      </section>

      <section className="space-y-5">
        <div className="flex items-end justify-between">
          <Label>Rondas</Label>
          <CreateRound />
        </div>

        {rounds === null && (
          <Note>Cargando rondas de devnet…</Note>
        )}

        {rounds?.length === 0 && (
          <Panel className="p-6">
            <Note>
              Todavía no hay rondas. Crea una para probar el flujo completo.
            </Note>
          </Panel>
        )}

        <div className="grid gap-3">
          {rounds?.map((r) => (
            <Link key={r.address.toBase58()} href={`/round/${r.address.toBase58()}`}>
              <Panel className="flex items-center justify-between p-5 transition hover:border-muted">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-[13px]">
                      #{r.roundId.toString().slice(-6)}
                    </span>
                    <StatusPill status={r.status} />
                    {r.transparent && (
                      <span className="rounded border border-open/40 px-2 py-0.5 font-mono text-[11px] text-open">
                        transparente
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[11px] text-muted">
                    {r.founderCount} founders · {r.builderCount} builders ·{" "}
                    {r.rankingCount} listas selladas
                  </div>
                </div>
                <Explorer address={r.address.toBase58()} />
              </Panel>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
