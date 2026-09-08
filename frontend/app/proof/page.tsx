"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Connection } from "@solana/web3.js";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DEVNET_RPC, PROGRAM_ID } from "@/lib/constants";
import { getReadProgram, type RoundAccount } from "@/lib/program";
import { fetchRounds } from "@/lib/rounds";
import { publicTeeConnection } from "@/lib/tee";
import { useT } from "@/lib/i18n";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LedgerProof } from "@/components/LedgerProof";
import { StabilityProof } from "@/components/StabilityProof";
import { VerifyPanel } from "@/components/VerifyPanel";

/**
 * Everything that can be checked, in one place, by someone who trusts nothing.
 *
 * The landing page argues; this page hands over the instruments. Each section
 * runs on the reader's own machine against public data, and the last one says
 * plainly what none of them can establish — which is the part a page like this
 * usually leaves out.
 */
export default function ProofPage() {
  const t = useT();
  const [rounds, setRounds] = useState<RoundAccount[] | null>(null);
  const [picked, setPicked] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const connection = new Connection(DEVNET_RPC, "confirmed");
        const { rounds: found } = await fetchRounds(
          connection,
          getReadProgram(connection),
          publicTeeConnection(),
        );
        // Only a transparent round publishes a trace to check.
        const checkable = found.filter((r) => r.transparent && r.status === "settled");
        setRounds(checkable);
        if (checkable[0]) setPicked(checkable[0].address.toBase58());
      } catch {
        setRounds([]);
      }
    })();
  }, []);

  const round = rounds?.find((r) => r.address.toBase58() === picked);

  return (
    <div className="space-y-10 pb-16">
      <header className="space-y-4">
        <Link
          href="/"
          className="inline-flex h-11 items-center gap-2 font-mono text-2xs text-muted transition-colors hover:text-chalk"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Ronda Ciega
        </Link>
        <div className="space-y-3">
          <p className="font-mono text-2xs uppercase tracking-[0.16em] text-dim">
            {t.proof.label}
          </p>
          <h1 className="display max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {t.proof.title}
          </h1>
          <p className="max-w-prose text-sm leading-relaxed text-muted">
            {t.proof.lede}
          </p>
        </div>
      </header>

      <ErrorBoundary>
        <LedgerProof />
      </ErrorBoundary>

      <ErrorBoundary>
        <StabilityProof />
      </ErrorBoundary>

      {/* ------------------------------------------------- a chosen round */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-base font-medium tracking-tight">{t.proof.round.title}</h2>
            <p className="max-w-prose text-xs leading-relaxed text-muted">
              {t.proof.round.lede}
            </p>
          </div>

          {rounds && rounds.length > 0 && (
            <label className="flex items-center gap-2 font-mono text-2xs text-muted">
              {t.proof.round.pick}
              <select
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
                className="glass h-11 cursor-pointer rounded-xl px-3 font-mono text-[16px] text-chalk outline-none sm:h-10 sm:text-sm"
              >
                {rounds.map((r) => (
                  <option key={r.address.toBase58()} value={r.address.toBase58()}>
                    #{r.roundId.toString().slice(-6)} · {r.founderCount}×{r.builderCount}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {rounds === null && (
          <div className="h-32 animate-pulse rounded-2xl border border-edge bg-surface/40" />
        )}
        {rounds?.length === 0 && (
          <p className="rounded-2xl border border-edge bg-surface/60 p-5 text-xs text-muted">
            {t.proof.round.none}
          </p>
        )}
        {round && (
          <ErrorBoundary>
            <VerifyPanel round={round} />
          </ErrorBoundary>
        )}
      </section>

      {/* --------------------------------------------------- the limits */}
      <section className="space-y-4 border-t border-edge pt-8">
        <h2 className="text-base font-medium tracking-tight">{t.proof.limits.title}</h2>
        <ul className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {t.proof.limits.items.map((l) => (
            <li key={l.title} className="space-y-1.5">
              <h3 className="font-mono text-2xs uppercase tracking-[0.14em] text-open">
                {l.title}
              </h3>
              <p className="text-xs leading-relaxed text-muted">{l.body}</p>
            </li>
          ))}
        </ul>

        <a
          href={`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-2 font-mono text-2xs text-sealed underline-offset-4 hover:underline"
        >
          {t.proof.limits.explorer}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </section>
    </div>
  );
}
