"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { motion, useReducedMotion } from "framer-motion";
import { Lock, PenLine, Wallet } from "lucide-react";
import BN from "bn.js";
import { getProgram, RoundAccount } from "@/lib/program";
import { escrowPda, participantPda } from "@/lib/pdas";
import { classifyError } from "@/lib/errors";
import { useT } from "@/lib/i18n";
import { springSnappy } from "@/lib/motion";
import { Button, ErrorText, Note } from "./ui";

/** What the deposit box accepts, in SOL. */
const MIN_SOL = 0.001;
const MAX_SOL = 100;

/**
 * Why this exists as its own control rather than a number beside a button.
 *
 * It is the first place in this project where somebody parts with money, and
 * the failure it has to prevent is not a bad transaction — the program refuses
 * those — it is a person who does not understand what happens to the amount
 * they typed. So the panel says all three things before it asks: the funds
 * stay on L1, the round cannot spend them, and an unmatched deposit comes
 * home. A confirm dialog after the fact would be too late for any of that.
 */
export function DepositPanel({
  round,
  onFunded,
}: {
  round: RoundAccount;
  onFunded: () => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const t = useT();
  const reduce = useReducedMotion();

  const [sol, setSol] = useState("0.02");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What landed, so the confirmation can name it rather than say "done". */
  const [locked, setLocked] = useState<number | null>(null);

  const amount = Number(sol);
  const invalid =
    sol.trim() === "" || !Number.isFinite(amount)
      ? "notNumber"
      : amount < MIN_SOL
        ? "tooSmall"
        : amount > MAX_SOL
          ? "tooBig"
          : null;

  async function lock() {
    if (!wallet.publicKey || invalid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const program = getProgram(connection, wallet as any);
      await program.methods
        .depositEscrow(
          new BN(round.roundId),
          new BN(Math.round(amount * LAMPORTS_PER_SOL)),
        )
        .accountsPartial({
          wallet: wallet.publicKey,
          round: round.address,
          participant: participantPda(round.address, wallet.publicKey),
          escrow: escrowPda(round.address, wallet.publicKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setLocked(amount);
      onFunded();
    } catch (e) {
      setError(t.errors[classifyError(e)]);
    } finally {
      setBusy(false);
    }
  }

  // Sealing a list ends in a panel that says it worked. Locking money did
  // not, and money is the one that deserves it more: the wallet closes, the
  // rail moves on, and nothing on screen has said the amount left. This is
  // the same shape as the sealed-list confirmation, in the escrow colour,
  // naming the figure back.
  if (locked !== null) {
    return (
      <motion.div
        initial={reduce ? undefined : { y: 8 }}
        animate={reduce ? undefined : { y: 0 }}
        transition={springSnappy}
        className="space-y-4 rounded-xl border border-escrow/45 bg-escrow/[0.07] p-4"
      >
        <div className="flex items-center gap-2.5">
          <motion.span
            initial={reduce ? undefined : { scale: 0.6 }}
            animate={reduce ? undefined : { scale: 1 }}
            transition={springSnappy}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-escrow/50 bg-escrow/10 text-escrow"
          >
            <Lock className="h-4 w-4" aria-hidden />
          </motion.span>
          <span className="font-mono text-2xs uppercase tracking-[0.16em] text-escrow">
            <span className="tnum">{locked}</span> SOL {t.deposit.locked}
          </span>
        </div>

        <Note>{t.deposit.lockedNote}</Note>

        <Button variant="ghost" onClick={() => setLocked(null)}>
          <PenLine className="h-3.5 w-3.5" aria-hidden />
          {t.deposit.addMore}
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={reduce ? undefined : { y: 8 }}
      animate={reduce ? undefined : { y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4 rounded-xl border border-escrow/40 bg-escrow/[0.05] p-4"
    >
      <div className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.16em] text-escrow">
        <Lock className="h-3.5 w-3.5" aria-hidden />
        {t.deposit.title}
      </div>

      <div className="space-y-2">
        <label htmlFor="deposit-sol" className="sr-only">
          {t.deposit.amount}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="deposit-sol"
            type="number"
            inputMode="decimal"
            step="0.001"
            min={MIN_SOL}
            max={MAX_SOL}
            value={sol}
            onChange={(e) => setSol(e.target.value)}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={invalid ? "deposit-error" : undefined}
            className={`glass tnum h-11 w-32 rounded-xl px-3.5 font-mono text-[16px] text-chalk outline-none sm:text-sm ${
              invalid ? "ring-1 ring-open" : ""
            }`}
          />
          <span className="font-mono text-xs text-muted">SOL</span>
        </div>
        {invalid && (
          <div id="deposit-error">
            <ErrorText>{t.deposit.errors[invalid]}</ErrorText>
          </div>
        )}
      </div>

      {/* Said before the wallet opens, not after. Each line is a fact about
          the program, and each is the answer to a question somebody about to
          part with money actually has. */}
      <ul className="space-y-1.5">
        {t.deposit.promises.map((line) => (
          <li key={line} className="flex gap-2 text-xs leading-relaxed text-muted">
            <span className="mt-[0.55em] h-px w-2.5 shrink-0 bg-escrow" aria-hidden />
            {line}
          </li>
        ))}
      </ul>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-open/40 bg-open/[0.06] px-3.5 py-3 text-xs leading-relaxed text-chalk/90"
        >
          {error}
        </p>
      )}

      <Button onClick={lock} busy={busy} disabled={!!invalid || !wallet.publicKey}>
        {t.deposit.submit}
      </Button>
    </motion.div>
  );
}

/**
 * How much this wallet has locked, if anything.
 *
 * Reads L1 directly rather than being handed down, because the answer is
 * public and cheap and the alternative is threading a number through four
 * components that do not otherwise care about money.
 */
export function useEscrow(round: PublicKey | null, wallet: PublicKey | null) {
  const { connection } = useConnection();
  const [lamports, setLamports] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    if (!round || !wallet) {
      setLamports(null);
      return;
    }
    (async () => {
      try {
        const info = await connection.getAccountInfo(escrowPda(round, wallet));
        // 8 discriminator + 32 + 32, then the u64 amount. Not the account
        // balance: that includes rent, which was never part of the offer.
        if (!info || info.data.length < 80) {
          if (live) setLamports(0);
          return;
        }
        const view = new DataView(
          info.data.buffer,
          info.data.byteOffset,
          info.data.byteLength,
        );
        if (live) setLamports(Number(view.getBigUint64(72, true)));
      } catch {
        // An RPC that will not answer is not evidence of an empty escrow.
        if (live) setLamports(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [connection, round?.toBase58(), wallet?.toBase58()]);

  return lamports;
}

/** The amount locked, in the one place it is always visible. */
export function EscrowBadge({ lamports }: { lamports: number | null }) {
  const t = useT();
  if (!lamports) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-escrow/40 bg-escrow/[0.07] px-2 py-1 font-mono text-2xs text-escrow">
      <Wallet className="h-3 w-3" aria-hidden />
      <span className="tnum">{(lamports / LAMPORTS_PER_SOL).toFixed(3)}</span>
      SOL {t.deposit.locked}
    </span>
  );
}
