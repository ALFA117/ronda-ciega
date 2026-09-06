"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  AnimatePresence,
  motion,
  Reorder,
  useDragControls,
  useReducedMotion,
} from "framer-motion";
import { GripVertical, Lock, PenLine, Plus, X } from "lucide-react";
import BN from "bn.js";
import { permissionPdaFromAccount } from "@magicblock-labs/ephemeral-rollups-sdk";
import { getProgram, ParticipantAccount, RoundAccount } from "@/lib/program";
import { participantPda, preferencesPda } from "@/lib/pdas";
import { teeConnection } from "@/lib/tee";
import { springLayout, springSnappy } from "@/lib/motion";
import { useT } from "@/lib/i18n";
import { Button, ErrorText, Label, Note, Panel } from "./ui";
import { useToast } from "./Toast";

/**
 * One chosen person. Drag to reorder.
 *
 * The grip exists because the row is also a scroll surface on a phone:
 * dragging from anywhere would fight the page scroll, so the drag starts from
 * the handle and `touch-none` is scoped to it alone.
 */
function ChosenRow({
  p,
  pos,
  onRemove,
}: {
  p: ParticipantAccount;
  pos: number;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  const reduce = useReducedMotion();

  return (
    <Reorder.Item
      value={p}
      dragListener={false}
      dragControls={controls}
      whileDrag={reduce ? undefined : { scale: 1.03, zIndex: 5 }}
      transition={springLayout}
      className="glass glass-sealed flex touch-pan-y items-center gap-3 rounded-xl px-3 py-2.5"
    >
      <button
        onPointerDown={(e) => controls.start(e)}
        aria-label="Reordenar"
        className="-ml-1 flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-muted active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>

      <motion.span
        layout
        transition={springSnappy}
        className="tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sealed font-mono text-2xs text-onSealed"
      >
        {pos}
      </motion.span>

      <span className="min-w-0 flex-1 truncate font-mono text-sm">{p.handle}</span>

      <motion.button
        onClick={onRemove}
        aria-label={`Quitar ${p.handle}`}
        whileTap={reduce ? undefined : { scale: 0.9 }}
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:text-chalk"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </motion.button>
    </Reorder.Item>
  );
}

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

  const [chosen, setChosen] = useState<ParticipantAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenKeys = new Set(chosen.map((c) => c.address.toBase58()));
  const available = others.filter((p) => !chosenKeys.has(p.address.toBase58()));

  async function submit() {
    if (!wallet.publicKey || !wallet.signMessage) return;
    setBusy(true);
    setError(null);
    try {
      // This signature is the moment the enclave learns who you are, and the
      // reason nobody else can read what you are about to write.
      const conn = await teeConnection(wallet.publicKey, (m) => wallet.signMessage!(m));
      const program = getProgram(conn, wallet as any);
      const preferences = preferencesPda(round.address, wallet.publicKey);

      await program.methods
        .submitRanking(
          new BN(round.roundId.toString()),
          Buffer.from(chosen.map((c) => c.index)),
        )
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

  if (done) {
    return (
      <motion.div
        initial={reduce ? undefined : { opacity: 0, y: 10 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={springLayout}
      >
        <Panel sealed className="space-y-5 p-6">
          <div className="flex items-center gap-2.5">
            <motion.span
              initial={reduce ? undefined : { scale: 0.5, opacity: 0 }}
              animate={reduce ? undefined : { scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 18 }}
              className="glass glass-sealed flex h-9 w-9 items-center justify-center rounded-xl text-sealed"
            >
              <Lock className="h-4 w-4" aria-hidden />
            </motion.span>
            <Label>{t.ranking.sealed}</Label>
          </div>
          <Note>{t.ranking.sealedNote}</Note>
          <Button variant="ghost" onClick={() => setDone(false)}>
            <PenLine className="h-3.5 w-3.5" aria-hidden />
            {t.ranking.change}
          </Button>
        </Panel>
      </motion.div>
    );
  }

  return (
    <Panel sealed className="space-y-6 p-5 sm:p-6">
      <div className="space-y-2">
        <Label>{t.ranking.label}</Label>
        <Note>{t.ranking.help}</Note>
      </div>

      {chosen.length > 0 && (
        <div className="space-y-2.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            {t.ranking.dragHint}
          </p>
          <Reorder.Group
            axis="y"
            values={chosen}
            onReorder={setChosen}
            className="space-y-2"
          >
            {chosen.map((p, i) => (
              <ChosenRow
                key={p.address.toBase58()}
                p={p}
                pos={i + 1}
                onRemove={() =>
                  setChosen((c) => c.filter((x) => !x.address.equals(p.address)))
                }
              />
            ))}
          </Reorder.Group>
        </div>
      )}

      {available.length > 0 && (
        <div className="space-y-2.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            {t.ranking.tapToAdd}
          </p>
          <div className="flex flex-wrap gap-2">
            <AnimatePresence initial={false}>
              {available.map((p) => (
                <motion.button
                  key={p.address.toBase58()}
                  layout
                  initial={reduce ? undefined : { opacity: 0, scale: 0.9 }}
                  animate={reduce ? undefined : { opacity: 1, scale: 1 }}
                  exit={reduce ? undefined : { opacity: 0, scale: 0.9 }}
                  whileTap={reduce ? undefined : { scale: 0.94 }}
                  transition={springSnappy}
                  onClick={() => setChosen((c) => [...c, p])}
                  className="glass flex h-11 cursor-pointer items-center gap-2 rounded-xl px-3.5 font-mono text-sm text-chalk sm:h-10"
                >
                  <Plus className="h-3.5 w-3.5 text-sealed" aria-hidden />
                  {p.handle}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {others.length === 0 && <Note>{t.ranking.nobody}</Note>}

      {error && <ErrorText>{error}</ErrorText>}

      <div className="space-y-3">
        <Button
          variant="sealed"
          onClick={submit}
          busy={busy}
          disabled={chosen.length === 0}
          full
        >
          <Lock className="h-3.5 w-3.5" aria-hidden />
          {t.ranking.seal}
        </Button>
        <Note>{t.ranking.signatureNote}</Note>
      </div>
    </Panel>
  );
}
