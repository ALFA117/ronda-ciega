"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { motion, useReducedMotion } from "framer-motion";
import { Droplets, Wallet } from "lucide-react";
import { useT } from "@/lib/i18n";
import { usePreflight } from "@/hooks/usePreflight";
import { springPanel } from "@/lib/motion";
import { RoundCreator } from "./RoundCreator";

const FAUCET = "https://faucet.solana.com/";

/**
 * Where a round gets opened, and the state you need to open one.
 *
 * The panel used to hold its own copy of the creation form — a second
 * `create()`, a second validation, a second thing to keep in step with the
 * one at the bottom of the page. Both are `RoundCreator` now, and there is
 * only one of it on the page.
 *
 * It renders for a disconnected reader too. That reverses an earlier call,
 * and the reason it is right this time is that what renders is no longer
 * four hundred pixels of controls nobody in that state can submit: it is the
 * rail, which says what opening a round involves, with the wallet button
 * sitting on the step that actually needs one. Reading the shape of the
 * thing is useful before you have a wallet. Filling in a form is not.
 *
 * The strip on top carries the one requirement that is invisible from here
 * and cannot be checked from here. The app always talks to devnet, so a
 * "wrong network" check would compare devnet against devnet and never fire.
 * The wallet's own selected cluster is what breaks signing, and no adapter
 * reports it reliably — so it is stated as a requirement up front, and the
 * failure it causes is translated afterwards instead of surfacing as
 * "an unknown error occurred".
 */
export function StartPanel() {
  const wallet = useWallet();
  const t = useT();
  const reduce = useReducedMotion();
  const { lowBalance, balanceSol } = usePreflight();

  const connected = !!wallet.publicKey;
  const address = wallet.publicKey?.toBase58() ?? "";
  const short = connected
    ? `${address.slice(0, 4)}…${address.slice(-4)}`
    : t.start.notConnected;

  return (
    <motion.section
      aria-label={t.create.rail.title}
      initial={reduce ? undefined : { y: 10 }}
      animate={reduce ? undefined : { y: 0 }}
      transition={springPanel}
      className="glass overflow-hidden rounded-2xl"
    >
      {/* Status strip: who you are, what you have, what the network must be. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-edge px-5 py-3">
        <span className="flex items-center gap-2 font-mono text-2xs text-muted">
          <Wallet
            className={`h-3.5 w-3.5 ${connected ? "text-sealed" : "text-dim"}`}
            aria-hidden
          />
          {t.start.wallet}
          <span className={`tnum ${connected ? "text-chalk" : "text-dim"}`}>{short}</span>
        </span>

        <span className="font-mono text-2xs text-muted">
          {t.start.balance}{" "}
          <span className={`tnum ${lowBalance && connected ? "text-open" : "text-chalk"}`}>
            {!connected ? "—" : balanceSol === null ? "…" : `${balanceSol.toFixed(3)} SOL`}
          </span>
        </span>

        <span className="font-mono text-2xs text-muted">
          {t.start.network} <span className="text-sealed">Devnet</span>
        </span>

        <a
          href={FAUCET}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 font-mono text-2xs text-sealed underline-offset-4 hover:underline"
        >
          <Droplets className="h-3.5 w-3.5" aria-hidden />
          {t.start.faucet}
        </a>
      </div>

      <div className="grid gap-8 p-5 sm:p-6 lg:grid-cols-[1fr_17rem]">
        <RoundCreator />

        <aside className="space-y-4 border-t border-edge pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <p className="rounded-xl border border-edge bg-surface2/60 px-3.5 py-3 text-xs leading-relaxed text-muted">
            {t.start.networkNote}
          </p>

          {connected && lowBalance && (
            <p className="font-mono text-2xs leading-relaxed text-open">
              {t.start.lowBalanceCta}
            </p>
          )}

          {/* What happens after the signature used to be a numbered list of
              four steps here — a third telling of the sequence the map at the
              top now draws once. This points at that drawing instead. */}
          <a
            href="#como-funciona"
            className="inline-flex items-center gap-1.5 font-mono text-2xs text-muted transition-colors hover:text-chalk"
          >
            {t.create.rail.next}
          </a>
        </aside>
      </div>
    </motion.section>
  );
}
