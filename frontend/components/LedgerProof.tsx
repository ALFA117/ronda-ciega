"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Terminal } from "lucide-react";
import { ACCOUNT_SIZE, countAccounts, curlFor } from "@/lib/chain-facts";
import { DEVNET_RPC } from "@/lib/constants";
import { useT } from "@/lib/i18n";
import { springPanel } from "@/lib/motion";

interface Row {
  key: "preferences" | "participants";
  value: number;
}

/**
 * The central claim, as a query anyone can run.
 *
 * Everywhere else the number zero is written by me. Here it is counted: a
 * public RPC call asks Solana devnet how many preference-list accounts this
 * program owns, and the answer is zero because those accounts are created
 * inside the enclave and destroyed there. The same call, one size along,
 * returns the hundreds of public profiles — which is the control. Without it
 * a zero could just mean the query was broken.
 *
 * The exact command is printed so the answer does not depend on this page
 * being honest about what it asked.
 */
export function LedgerProof() {
  const t = useT();
  const reduce = useReducedMotion();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const [preferences, participants] = await Promise.all([
        countAccounts(DEVNET_RPC, ACCOUNT_SIZE.preferences),
        countAccounts(DEVNET_RPC, ACCOUNT_SIZE.participant),
      ]);
      setRows([
        { key: "preferences", value: preferences },
        { key: "participants", value: participants },
      ]);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  // The profiles query is the control: it asks the same program for a
  // different account size and must come back non-zero.
  const controlOk =
    (rows?.find((r) => r.key === "participants")?.value ?? 0) > 0;

  return (
    <section className="rounded-2xl border border-edge bg-surface/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h3 className="text-base font-medium tracking-tight">{t.ledger.title}</h3>
          <p className="max-w-prose text-xs leading-relaxed text-muted">
            {t.ledger.lede}
          </p>
        </div>
        <button
          onClick={run}
          disabled={busy}
          className="glass h-11 shrink-0 cursor-pointer rounded-xl px-4 font-mono text-2xs text-chalk transition-colors hover:text-sealed disabled:opacity-60"
        >
          {busy ? t.ledger.running : t.ledger.run}
        </button>
      </div>

      <AnimatePresence>
        {rows && (
          <motion.dl
            initial={reduce ? undefined : { opacity: 0, y: 8 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={springPanel}
            className="mt-5 grid gap-px overflow-hidden rounded-xl border border-edge bg-edge sm:grid-cols-2"
          >
            {rows.map((r) => (
              <div key={r.key} className="bg-surface px-4 py-3.5">
                <dt className="font-mono text-2xs uppercase tracking-[0.12em] text-dim">
                  {r.key === "preferences" ? t.ledger.lists : t.ledger.profiles}
                </dt>
                <dd
                  className={`tnum font-mono text-2xl ${
                    r.key === "preferences" ? "text-sealed" : "text-chalk"
                  }`}
                >
                  {r.value}
                </dd>
                <dd className="mt-0.5 text-2xs text-muted">
                  {r.key === "preferences" ? t.ledger.listsNote : t.ledger.profilesNote}
                </dd>
              </div>
            ))}
          </motion.dl>
        )}
      </AnimatePresence>

      {/* The control, read out loud.
          Both figures were already on screen, but the big cyan zero is the one
          that carries the argument and it reads as proof on its own. If the
          control is also zero the query did not work, and saying so is the
          difference between evidence and a number. */}
      {rows && (
        <p
          className={`mt-4 max-w-prose text-xs leading-relaxed ${
            controlOk ? "text-muted" : "text-open"
          }`}
        >
          {controlOk ? t.ledger.verdictOk : t.ledger.verdictBroken}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 font-mono text-2xs text-open">
          {error}
        </p>
      )}

      {/* Wide content scrolls inside its own box rather than widening the page. */}
      <details className="group mt-4">
        <summary className="inline-flex cursor-pointer items-center gap-2 font-mono text-2xs text-muted transition-colors hover:text-chalk">
          <Terminal className="h-3.5 w-3.5" aria-hidden />
          {t.ledger.showCommand}
        </summary>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-edge bg-surface2/60 p-3 font-mono text-[11px] leading-relaxed text-muted">
          {curlFor(DEVNET_RPC, ACCOUNT_SIZE.preferences)}
        </pre>
      </details>
    </section>
  );
}
