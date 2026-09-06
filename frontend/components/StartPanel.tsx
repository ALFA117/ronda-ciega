"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Droplets, Wallet } from "lucide-react";
import BN from "bn.js";
import { getProgram } from "@/lib/program";
import { roundPda } from "@/lib/pdas";
import { classifyError } from "@/lib/errors";
import { useT } from "@/lib/i18n";
import { usePreflight } from "@/hooks/usePreflight";
import { springPanel } from "@/lib/motion";
import { Button } from "./ui";

const FAUCET = "https://faucet.solana.com/";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false, loading: () => <div className="glass h-11 w-[150px] rounded-xl" /> },
);

/**
 * What a connected wallet sees first.
 *
 * Before this, connecting changed nothing visible: the only way to open a
 * round was to scroll to the bottom and find a button. Someone who has just
 * connected a wallet is there to do something, not to read the pitch again.
 *
 * It also carries the one requirement that is invisible from here and cannot
 * be checked from here. The app always talks to devnet, so the old
 * "wrong network" check compared devnet against devnet and could never fire.
 * The wallet's own selected cluster is what breaks signing, and no adapter
 * reports it reliably — so it is stated as a requirement up front, and the
 * failure it causes is translated afterwards instead of surfacing as
 * "an unknown error occurred".
 */
export function StartPanel() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const router = useRouter();
  const t = useT();
  const reduce = useReducedMotion();
  const { lowBalance, balanceSol } = usePreflight();

  const [minutes, setMinutes] = useState(10);
  const [transparent, setTransparent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = !!wallet.publicKey;
  const address = wallet.publicKey?.toBase58() ?? "";
  const short = connected
    ? `${address.slice(0, 4)}…${address.slice(-4)}`
    : t.start.notConnected;

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
    } catch (e) {
      setError(t.errors[classifyError(e)]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.section
      aria-label={t.start.title}
      initial={reduce ? undefined : { opacity: 0, y: 10 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
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

      <div className="grid gap-8 p-5 sm:p-6 lg:grid-cols-[1fr_18rem]">
        {/* ---------------------------------------------------- the form */}
        <div className="space-y-5">
          <h2 className="text-lg font-medium tracking-tight">{t.start.title}</h2>

          <div className="space-y-2">
            <label
              htmlFor="closes-in"
              className="block font-mono text-2xs uppercase tracking-widest text-muted"
            >
              {t.create.closesIn}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="closes-in"
                type="number"
                min={1}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="glass h-11 w-24 rounded-xl px-3.5 font-mono text-[16px] text-chalk outline-none placeholder:text-dim"
              />
              <span className="font-mono text-xs text-muted">{t.create.minutes}</span>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={transparent}
              onChange={(e) => setTransparent(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[color:var(--open)]"
            />
            <span className="space-y-1">
              <span className="block font-mono text-xs text-open">
                {t.create.transparent}
              </span>
              <span className="block text-xs leading-relaxed text-muted">
                {t.create.transparentNote}
              </span>
            </span>
          </label>

          {/* The requirement that cannot be detected, said before it bites. */}
          <p className="rounded-xl border border-edge bg-surface2/60 px-3.5 py-3 text-xs leading-relaxed text-muted">
            {t.start.networkNote}
          </p>

          {connected && lowBalance && (
            <p className="font-mono text-2xs leading-relaxed text-open">
              {t.start.lowBalanceCta}
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-open/40 bg-open/[0.06] px-3.5 py-3 text-xs leading-relaxed text-chalk/90"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {connected ? (
              <Button onClick={create} busy={busy}>
                {t.create.submit}
              </Button>
            ) : (
              <WalletMultiButton />
            )}
            <span className="font-mono text-2xs text-dim">{t.create.devnetNote}</span>
          </div>
        </div>

        {/* ------------------------------------------- what happens next */}
        <aside className="space-y-3 border-t border-edge pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <h3 className="font-mono text-2xs uppercase tracking-[0.14em] text-dim">
            {t.start.whatHappens}
          </h3>
          <ol className="space-y-3">
            {t.start.steps.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="tnum shrink-0 font-mono text-2xs text-sealed">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-xs leading-relaxed text-muted">{s}</span>
              </li>
            ))}
          </ol>
          <a
            href="#rondas"
            className="inline-flex items-center gap-1.5 pt-1 font-mono text-2xs text-muted transition-colors hover:text-chalk"
          >
            {t.rounds.label}
            <ArrowRight className="h-3 w-3" aria-hidden />
          </a>
        </aside>
      </div>
    </motion.section>
  );
}
