"use client";

import { useState } from "react";
import { Connection } from "@solana/web3.js";
import { Check, EyeOff, Minus, X } from "lucide-react";
import { DEVNET_RPC } from "@/lib/constants";
import { publicTeeConnection } from "@/lib/tee";
import type { ParticipantAccount, RoundAccount } from "@/lib/program";
import { preferencesPda } from "@/lib/pdas";
import { probeOk, verdict, type ProbeResults } from "@/lib/probe";
import { useT } from "@/lib/i18n";

/**
 * The privacy claim, executed in the reader's browser, with its controls.
 *
 * Every preference account has a deterministic address derived from the round
 * and the owner's wallet, so anyone can compute them and go looking. This does,
 * on both chains, and shows what comes back.
 *
 * The version this replaces asked L1 only, and reported a single figure: "12
 * checked, 0 found". That is the exact shape of evidence the project's own
 * README warns against — an absence with no control beside it is
 * indistinguishable from a query pointed at the wrong cluster, and it was the
 * page's central claim resting on it. It also never rendered on a transparent
 * round, which is the round a visitor is most likely to open, and where the
 * claim still holds: transparency publishes the algorithm's frames, never
 * anybody's list.
 *
 * So there are four probes, and two of them are supposed to succeed. The
 * verdict is not allowed to read "shielded" unless they did.
 */
export function PrivacyPanel({
  round,
  participants,
}: {
  round: RoundAccount;
  participants: ParticipantAccount[];
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [r, setR] = useState<ProbeResults | null>(null);

  if (participants.length === 0) return null;

  const addresses = participants.map((p) => preferencesPda(round.address, p.wallet));

  async function look() {
    setBusy(true);
    setError(null);
    setR(null);
    try {
      const l1 = new Connection(DEVNET_RPC, "confirmed");
      // No token. This is the connection an outsider has, which is the whole
      // point: the enclave decides what to serve it.
      const tee = publicTeeConnection();

      // Each lane fails on its own. A rate-limited L1 must not wipe out a
      // successful rollup probe, or the panel would report "inconclusive"
      // about a lane that answered perfectly well.
      const settle = async <T,>(p: Promise<T>): Promise<T | null> => {
        try {
          return await p;
        } catch {
          return null;
        }
      };

      const [l1Round, teeRound, l1Prefs, teePrefs] = await Promise.all([
        settle(l1.getAccountInfo(round.address)),
        settle(tee.getAccountInfo(round.address)),
        settle(l1.getMultipleAccountsInfo(addresses)),
        settle(tee.getMultipleAccountsInfo(addresses)),
      ]);

      setR({
        l1Control: l1Round === null ? false : true,
        teeControl: teeRound === null ? false : true,
        l1Found: l1Prefs ? l1Prefs.filter(Boolean).length : null,
        teeFound: teePrefs ? teePrefs.filter(Boolean).length : null,
        checked: addresses.length,
      });
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const v = r ? verdict(r) : "pending";

  const rows: {
    key: string;
    label: string;
    kind: "control" | "absence";
    value: boolean | number | null;
    detail: string | null;
  }[] = r
    ? [
        {
          key: "l1c",
          label: t.privacy.probeL1Control,
          kind: "control",
          value: r.l1Control,
          detail: null,
        },
        {
          key: "teec",
          label: t.privacy.probeTeeControl,
          kind: "control",
          value: r.teeControl,
          detail: null,
        },
        {
          key: "l1p",
          label: t.privacy.probeL1Prefs,
          kind: "absence",
          value: r.l1Found,
          detail: r.l1Found === null ? null : `${r.l1Found} / ${r.checked}`,
        },
        {
          key: "teep",
          label: t.privacy.probeTeePrefs,
          kind: "absence",
          value: r.teeFound,
          detail: r.teeFound === null ? null : `${r.teeFound} / ${r.checked}`,
        },
      ]
    : [];

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

      {r && (
        <div className="animate-fade-in">
          <ul className="mt-5 divide-y divide-edge overflow-hidden rounded-xl border border-edge">
            {rows.map((row) => {
              const ok = probeOk(row.kind, row.value);
              return (
                <li
                  key={row.key}
                  className="flex items-center gap-3 bg-surface px-4 py-3"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      ok === null
                        ? "bg-edge text-dim"
                        : ok
                          ? "bg-sealed/15 text-sealed"
                          : "bg-open/15 text-open"
                    }`}
                  >
                    {ok === null ? (
                      <Minus className="h-3 w-3" aria-hidden />
                    ) : ok ? (
                      <Check className="h-3 w-3" aria-hidden />
                    ) : (
                      <X className="h-3 w-3" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
                    {row.label}
                  </span>
                  {row.detail && (
                    <span
                      className={`tnum shrink-0 font-mono text-2xs ${
                        ok ? "text-sealed" : "text-open"
                      }`}
                    >
                      {row.detail}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {/* The verdict, and it is allowed to be unflattering. A panel that
              can only ever print good news is not evidence. */}
          <p
            className={`mt-4 text-xs leading-relaxed ${
              v === "shielded"
                ? "text-muted"
                : v === "leaked"
                  ? "text-open"
                  : "text-muted"
            }`}
          >
            {v === "shielded"
              ? t.privacy.passed
              : v === "leaked"
                ? t.privacy.failed
                : t.privacy.inconclusive}
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
            <li
              key={a.toBase58()}
              className="whitespace-nowrap font-mono text-[11px] text-muted"
            >
              <span className="text-dim">{participants[i].handle}</span>{" "}
              {a.toBase58()}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
