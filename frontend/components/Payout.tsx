"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ArrowUpRight, Clock, Undo2, Wallet } from "lucide-react";
import BN from "bn.js";
import { getProgram, ParticipantAccount, RoundAccount } from "@/lib/program";
import { escrowPda } from "@/lib/pdas";
import { classifyError } from "@/lib/errors";
import { payoutAction } from "@/lib/payout";
import { nowSeconds } from "@/lib/rounds";
import { useT } from "@/lib/i18n";
import { Button, Note } from "./ui";

/**
 * The other half of the deposit: the button that moves it.
 *
 * Locking money had a panel; paying it out had nothing, so a deposit on this
 * site could only ever be settled by `scripts/escrow.ts`. This offers exactly
 * what the program will accept for this person, and nothing else — the
 * decision lives in `lib/payout.ts`, where it is tested against the same rules
 * as `check_settle` and `check_refund`.
 *
 * `settle_pair` takes no signer: the connected wallet only pays the fee, which
 * is why either side of a pair can send it, and why the money can only go to
 * the wallet the matching chose. `refund_escrow` does take one, the
 * depositor's, because only they get the money back.
 */
export function Payout({
  round,
  me,
  partner,
  escrow,
  delegated,
  onDone,
}: {
  round: RoundAccount;
  me: ParticipantAccount;
  partner?: ParticipantAccount;
  /** Lamports in the escrow that would move: the founder's, either way. */
  escrow: number | null;
  delegated: boolean;
  onDone: () => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ kind: "paid" | "refunded"; sig: string } | null>(
    null,
  );

  const action = payoutAction({
    status: round.status,
    deadlineTs: round.deadlineTs,
    now: nowSeconds(),
    onL1: !delegated,
    side: me.side,
    partner: partner ? partner.index : null,
    escrow,
  });

  if (done) {
    return (
      <div className="space-y-2 rounded-xl border border-escrow/45 bg-escrow/[0.07] p-4">
        <div className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.16em] text-escrow">
          <Wallet className="h-3.5 w-3.5" aria-hidden />
          {done.kind === "paid" ? t.payout.paid : t.payout.refunded}
        </div>
        <Note>{t.payout.doneNote}</Note>
        <a
          href={`https://explorer.solana.com/tx/${done.sig}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[44px] items-center gap-1.5 font-mono text-2xs text-escrow transition-colors hover:text-chalk"
        >
          {t.payout.viewTx}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    );
  }

  if (!action) return null;

  const amount =
    escrow !== null ? (escrow / LAMPORTS_PER_SOL).toFixed(3) : undefined;
  const handle = partner?.handle ?? "";

  if (action === "waitSettled" || action === "waitExpired") {
    return (
      <div className="glass flex items-start gap-3 rounded-xl px-4 py-3.5">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-escrow" aria-hidden />
        <p className="text-xs leading-relaxed text-muted">
          {action === "waitSettled" ? t.payout.waitSettled : t.payout.waitExpired}
        </p>
      </div>
    );
  }

  async function send() {
    if (!wallet.publicKey || busy || !action) return;
    setBusy(true);
    setError(null);
    try {
      const program = getProgram(connection, wallet as any);
      const id = new BN(round.roundId.toString());
      let sig: string;
      if (action === "refund") {
        sig = await program.methods
          .refundEscrow(id)
          .accountsPartial({
            wallet: me.wallet,
            round: round.address,
            participant: me.address,
            escrow: escrowPda(round.address, me.wallet),
          })
          .rpc();
      } else {
        // Founder pays, builder is paid, whichever of the two is sending.
        const founder = me.side === "founder" ? me : partner!;
        const builder = me.side === "founder" ? partner! : me;
        sig = await program.methods
          .settlePair(id)
          .accountsPartial({
            round: round.address,
            payerParticipant: founder.address,
            payeeParticipant: builder.address,
            escrow: escrowPda(round.address, founder.wallet),
            payerWallet: founder.wallet,
            payeeWallet: builder.wallet,
          })
          .rpc();
      }
      setDone({ kind: action === "refund" ? "refunded" : "paid", sig });
      onDone();
    } catch (e) {
      setError(t.errors[classifyError(e)]);
    } finally {
      setBusy(false);
    }
  }

  const note =
    action === "pay"
      ? t.payout.payNote.replace("{handle}", handle)
      : action === "collect"
        ? t.payout.collectNote.replace("{handle}", handle)
        : round.status === "settled"
          ? t.payout.refundUnmatched
          : t.payout.refundExpired;

  const label =
    action === "pay"
      ? t.payout.pay.replace("{handle}", handle)
      : action === "collect"
        ? t.payout.collect.replace("{handle}", handle)
        : t.payout.refund;

  return (
    <div className="space-y-3 rounded-xl border border-escrow/40 bg-escrow/[0.05] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.16em] text-escrow">
          <Wallet className="h-3.5 w-3.5" aria-hidden />
          {t.payout.title}
        </span>
        {amount && (
          <span className="tnum font-mono text-2xs text-escrow">{amount} SOL</span>
        )}
      </div>

      <p className="text-xs leading-relaxed text-muted">{note}</p>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-open/40 bg-open/[0.06] px-3.5 py-3 text-xs leading-relaxed text-chalk/90"
        >
          {error}
        </p>
      )}

      <Button onClick={send} busy={busy} disabled={!wallet.publicKey}>
        {action === "refund" && <Undo2 className="h-3.5 w-3.5" aria-hidden />}
        {label}
      </Button>
    </div>
  );
}
