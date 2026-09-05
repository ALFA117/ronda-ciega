"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Connection } from "@solana/web3.js";
import { ArrowRight, EyeOff, Gauge, ShieldCheck } from "lucide-react";
import { DEVNET_RPC } from "@/lib/constants";
import { decodeRound, getReadProgram, RoundAccount } from "@/lib/program";
import { stagger, wordIn } from "@/lib/motion";
import {
  Explorer,
  Label,
  Note,
  Panel,
  Reveal,
  StaggerItem,
  StaggerList,
  StatusPill,
  Tag,
} from "@/components/ui";
import { CreateRound } from "@/components/CreateRound";
import { HeroVisual } from "@/components/HeroVisual";

const HEADLINE = "Dices a quién quieres".split(" ");
const SUBLINE = "sin que nadie sepa que lo dijiste.".split(" ");

export default function Home() {
  const [rounds, setRounds] = useState<RoundAccount[] | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    (async () => {
      try {
        const program = getReadProgram(new Connection(DEVNET_RPC, "confirmed"));
        const raw = await (program.account as any).round.all();
        setRounds(
          raw
            .map((r: any) => decodeRound(r.publicKey, r.account))
            .sort((a: RoundAccount, b: RoundAccount) => Number(b.roundId - a.roundId)),
        );
      } catch {
        setRounds([]);
      }
    })();
  }, []);

  return (
    <div className="space-y-24 sm:space-y-32">
      {/* Hero */}
      <section className="relative aurora grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
        <div className="space-y-7">
          <motion.h1
            className="text-2xl font-medium tracking-[-0.02em] [text-wrap:balance] sm:text-3xl"
            variants={reduce ? undefined : stagger()}
            initial={reduce ? undefined : "hidden"}
            animate={reduce ? undefined : "show"}
          >
            <span className="block">
              {HEADLINE.map((w, i) => (
                <motion.span
                  key={i}
                  variants={reduce ? undefined : wordIn}
                  className="mr-[0.25em] inline-block"
                >
                  {w}
                </motion.span>
              ))}
            </span>
            <span className="block text-muted">
              {SUBLINE.map((w, i) => (
                <motion.span
                  key={i}
                  variants={reduce ? undefined : wordIn}
                  className="mr-[0.25em] inline-block"
                >
                  {w}
                </motion.span>
              ))}
            </span>
          </motion.h1>

          <Reveal delay={0.25} className="max-w-prose space-y-4 text-base text-chalk/80">
            <p>
              Emparejar cofundadores es un mercado de sinceridad rota. Todos
              tienen un ranking mental y casi nadie lo declara, porque declararlo
              solo cuesta si el otro no corresponde.
            </p>
            <p>
              Gale–Shapley resolvió esto en 1962, pero necesita un tercero de
              confianza que reciba todas las listas y no las filtre. Aquí ese
              tercero es un{" "}
              <span className="text-sealed glow-sealed">
                Private Ephemeral Rollup
              </span>
              : las listas viven en cuentas que solo su autor puede leer, el
              algoritmo corre dentro del enclave, y lo único que se publica son
              los pares finales.
            </p>
          </Reveal>

          <Reveal delay={0.35}>
            <Link
              href="#rondas"
              className="group inline-flex items-center gap-2 font-mono text-sm text-chalk transition-colors hover:text-sealed"
            >
              Ver rondas
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <HeroVisual />
        </Reveal>
      </section>

      {/* The three claims */}
      <StaggerList className="grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: EyeOff,
            title: "No es un commit-reveal",
            body: "Un commit-reveal compra secreto hasta un deadline: verificar exige publicar el preimagen. Una lista de preferencias tiene que quedar secreta para siempre.",
          },
          {
            icon: ShieldCheck,
            title: "El enclave hace de tercero",
            body: "Las cuentas con tu ranking se crean dentro del rollup y se cierran ahí. No hay instrucción en el programa que las revele, ni al cerrar ni después.",
          },
          {
            icon: Gauge,
            title: "Todo en una transacción",
            body: "El matching completo corre dentro de una sola transacción del rollup, grabando un frame por ronda de propuestas. Un cliente remoto no puede hacer N transacciones rápido; sí puede hacer una que haga N rondas.",
          },
        ].map((c) => (
          <StaggerItem key={c.title}>
            <Panel className="h-full space-y-3 p-5">
              <c.icon className="h-4 w-4 text-sealed" aria-hidden />
              <h3 className="text-sm font-medium">{c.title}</h3>
              <p className="text-xs leading-relaxed text-muted">{c.body}</p>
            </Panel>
          </StaggerItem>
        ))}
      </StaggerList>

      {/* Rounds */}
      <section id="rondas" className="scroll-mt-24 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Label>Rondas</Label>
            <Note>Todo corre en devnet. No se mueve dinero real.</Note>
          </div>
          <CreateRound />
        </div>

        {rounds === null && (
          <div className="space-y-3" aria-live="polite">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-[86px] animate-pulse rounded-xl border border-edge bg-surface/40"
              />
            ))}
          </div>
        )}

        {rounds?.length === 0 && (
          <Panel className="p-8 text-center">
            <Note>Todavía no hay rondas. Crea una para probar el flujo completo.</Note>
          </Panel>
        )}

        <StaggerList className="grid gap-3">
          {rounds?.map((r) => (
            <StaggerItem key={r.address.toBase58()}>
              <Link href={`/round/${r.address.toBase58()}`} className="block">
                <motion.div
                  whileHover={reduce ? undefined : { y: -2 }}
                  transition={{ type: "spring", stiffness: 400, damping: 24 }}
                  className="flex items-center justify-between gap-4 rounded-xl border border-edge bg-surface/70 p-5 transition-colors hover:border-edgeStrong"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tnum font-mono text-sm">
                        #{r.roundId.toString().slice(-6)}
                      </span>
                      <StatusPill status={r.status} />
                      {r.transparent && <Tag tone="open">transparente</Tag>}
                    </div>
                    <div className="tnum font-mono text-2xs text-muted">
                      {r.founderCount} founders · {r.builderCount} builders ·{" "}
                      <span className="text-sealed">
                        {r.rankingCount} listas selladas
                      </span>
                    </div>
                  </div>
                  <Explorer address={r.address.toBase58()} />
                </motion.div>
              </Link>
            </StaggerItem>
          ))}
        </StaggerList>
      </section>
    </div>
  );
}
