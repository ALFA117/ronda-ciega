"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Lock, PenLine } from "lucide-react";
import BN from "bn.js";
import { permissionPdaFromAccount } from "@magicblock-labs/ephemeral-rollups-sdk";
import { getProgram, ParticipantAccount, RoundAccount } from "@/lib/program";
import { participantPda, preferencesPda } from "@/lib/pdas";
import { teeConnection } from "@/lib/tee";
import { springLayout, springSnappy } from "@/lib/motion";
import { useT } from "@/lib/i18n";
import { Button, ErrorText, Label, Note, Panel } from "./ui";
import { useToast } from "./Toast";

export function RankingBuilder({
  round,
  me,
  participants,
  onSubmitted,
}: {
  round: RoundAccount;
  me: ParticipantAccount;
  participants: ParticipantAccount[];
  onSubmitted: () => void;
}) {
  const wallet = useWallet();
  const t = useT();
  const toast = useToast();
  const reduce = useReducedMotion();
  const others = participants
    .filter((p) => p.side !== me.side)
    .sort((a, b) => a.index - b.index);

  const [ranking, setRanking] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (idx: number) =>
    setRanking((r) => (r.includes(idx) ? r.filter((v) => v !== idx) : [...r, idx]));

  async function submit() {
    if (!wallet.publicKey || !wallet.signMessage) return;
    setBusy(true);
    setError(null);
    try {
      // This signature is the moment the enclave learns who you are. It is also
      // the reason nobody else can read what you are about to write.
      const conn = await teeConnection(wallet.publicKey, (m) => wallet.signMessage!(m));
      const program = getProgram(conn, wallet as any);
      const preferences = preferencesPda(round.address, wallet.publicKey);

      await program.methods
        .submitRanking(new BN(round.roundId.toString()), Buffer.from(ranking))
        .accountsPartial({
          wallet: wallet.publicKey,
          round: round.address,
          participant: participantPda(round.address, wallet.publicKey),
          preferences,
          preferencesPermission: permissionPdaFromAccount(preferences),
        })
        .rpc();

      setDone(true);
      toast(t.ranking.sealed);
      onSubmitted();
    } catch (e: any) {
      const msg = e.message || String(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence mode="wait">
      {done ? (
        <motion.div
          key="sealed"
          initial={reduce ? undefined : { opacity: 0, y: 10 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={springLayout}
        >
          <Panel sealed className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <motion.span
                initial={reduce ? undefined : { scale: 0.5, opacity: 0 }}
                animate={reduce ? undefined : { scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 18 }}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-sealed/15 text-sealed"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden />
              </motion.span>
              <Label>{t.ranking.sealed}</Label>
            </div>
            <Note>
              {t.ranking.sealedNote}
            </Note>
            <Button variant="ghost" onClick={() => setDone(false)}>
              <PenLine className="h-3.5 w-3.5" aria-hidden />
              {t.ranking.change}
            </Button>
          </Panel>
        </motion.div>
      ) : (
        <motion.div
          key="builder"
          initial={reduce ? undefined : { opacity: 0, y: 10 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={springLayout}
        >
          <Panel sealed className="space-y-5 p-6">
            <div className="space-y-2">
              <Label>{t.ranking.label}</Label>
              <Note>
                {t.ranking.help}
              </Note>
            </div>

            <div className="grid gap-2">
              {others.map((p) => {
                const pos = ranking.indexOf(p.index);
                const chosen = pos >= 0;
                return (
                  <motion.button
                    key={p.address.toBase58()}
                    layout
                    onClick={() => toggle(p.index)}
                    whileTap={reduce ? undefined : { scale: 0.985 }}
                    transition={springSnappy}
                    aria-pressed={chosen}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                      chosen
                        ? "border-sealed/50 bg-sealed/10"
                        : "border-edge hover:border-edgeStrong hover:bg-surface2"
                    }`}
                  >
                    <motion.span
                      layout
                      transition={springSnappy}
                      className={`tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-2xs ${
                        chosen
                          ? "bg-sealed text-onSealed"
                          : "border border-edge text-muted"
                      }`}
                    >
                      {chosen ? pos + 1 : "·"}
                    </motion.span>
                    <span className="font-mono text-sm">{p.handle}</span>
                    {p.link && (
                      <span className="ml-auto hidden truncate font-mono text-2xs text-muted sm:block">
                        {p.link}
                      </span>
                    )}
                    <AnimatePresence>
                      {chosen && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.6 }}
                          transition={springSnappy}
                          className="ml-auto text-sealed sm:ml-0"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>

            {others.length === 0 && (
              <Note>{t.ranking.nobody}</Note>
            )}

            {error && <ErrorText>{error}</ErrorText>}

            <div className="space-y-2">
              <Button
                variant="sealed"
                onClick={submit}
                busy={busy}
                disabled={ranking.length === 0}
              >
                <Lock className="h-3.5 w-3.5" aria-hidden />
                {t.ranking.seal}
              </Button>
              <Note>
                {t.ranking.signatureNote}
              </Note>
            </div>
          </Panel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
