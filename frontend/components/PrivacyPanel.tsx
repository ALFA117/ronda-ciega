"use client";

import { useState } from "react";
import { Connection } from "@solana/web3.js";
import { EyeOff, Lock } from "lucide-react";
import { DEVNET_RPC } from "@/lib/constants";
import type { ParticipantAccount, RoundAccount } from "@/lib/program";
import { preferencesPda } from "@/lib/pdas";
import { useT } from "@/lib/i18n";

/**
 * What a private round refuses to show, demonstrated rather than described.
 *
 * A transparent round can be checked frame by frame. A private one publishes
 * nothing to check — which is the product, and which leaves this page with a
 * claim and no evidence.
 *
 * There is evidence, though, and it is the negative kind. Every preference
 * account has a deterministic address derived from the round and the owner's
 * wallet, so the addresses can be computed by anyone. This asks Solana for
 * each of them and shows what comes back: nothing, because they were written
 * inside the enclave and destroyed there without ever touching L1.
 */
export function PrivacyPanel({
  round,
  participants,
}: {
  round: RoundAccount;
  participants: ParticipantAccount[];
}) {
  const t = useT();
  const [result, setResult] = useState<{ checked: number; found: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A transparent round has its own panel; this one is for the private case.
  if (round.transparent || participants.length === 0) return null;

  const addresses = participants.map((p) => preferencesPda(round.address, p.wallet));

  async function look() {
    setBusy(true);
    setError(null);
    try {
      const connection = new Connection(DEVNET_RPC, "confirmed");
      const infos = await connection.getMultipleAccountsInfo(addresses);
      setResult({
        checked: addresses.length,
        found: infos.filter((i) => i !== null).length,
      });
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-edge bg-surface/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h2 className="flex items-center gap-2 text-base font-medium tracking-tight">
            <EyeOff className="h-4 w-4 text-sealed" aria-hidden />
            {t.privacy.title}
          </h2>
          <p className="max-w-prose text-xs leading-relaxed text-muted">
            {t.privacy.lede}
          </p>
        </div>
        <button
          onClick={look}
          disabled={busy}
          className="glass h-11 shrink-0 cursor-pointer rounded-xl px-4 font-mono text-2xs text-chalk transition-colors hover:text-sealed disabled:opacity-60"
        >
          {busy ? t.privacy.running : t.privacy.run}
        </button>
      </div>

      {result && (
        <div className="animate-fade-in">
          <dl className="mt-5 grid gap-px overflow-hidden rounded-xl border border-edge bg-edge sm:grid-cols-2">
            <div className="bg-surface px-4 py-3.5">
              <dt className="font-mono text-2xs uppercase tracking-[0.12em] text-dim">
                {t.privacy.checked}
              </dt>
              <dd className="tnum font-mono text-2xl text-chalk">{result.checked}</dd>
            </div>
            <div className="bg-surface px-4 py-3.5">
              <dt className="font-mono text-2xs uppercase tracking-[0.12em] text-dim">
                {t.privacy.found}
              </dt>
              <dd
                className={`tnum font-mono text-2xl ${
                  result.found === 0 ? "text-sealed" : "text-open"
                }`}
              >
                {result.found}
              </dd>
            </div>
          </dl>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sealed" aria-hidden />
            {result.found === 0 ? t.privacy.passed : t.privacy.failed}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 font-mono text-2xs text-open">
          {error}
        </p>
      )}

      <details className="group mt-4">
        <summary className="inline-flex cursor-pointer items-center gap-2 font-mono text-2xs text-muted transition-colors hover:text-chalk">
          {t.privacy.showAddresses}
        </summary>
        <ul className="mt-3 space-y-1 overflow-x-auto rounded-xl border border-edge bg-surface2/60 p-3">
          {addresses.map((a, i) => (
            <li key={a.toBase58()} className="whitespace-nowrap font-mono text-[11px] text-muted">
              <span className="text-dim">{participants[i].handle}</span> {a.toBase58()}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
