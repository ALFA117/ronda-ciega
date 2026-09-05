"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Pause, Play, RotateCcw } from "lucide-react";
import { framesFor, ParticipantAccount, RoundAccount } from "@/lib/program";
import { useT } from "@/lib/i18n";
import { MatchGraph } from "./MatchGraph";
import { Label, Note, Panel } from "./ui";

/**
 * Replays the matching frame by frame.
 *
 * Frames come from the round's recorded history, not from transaction logs —
 * the TEE serves no logs for transactions touching private accounts. And the
 * history only exists when the round is transparent, so a private round shows
 * its outcome and says why there is nothing to animate. That absence is the
 * product working, not a missing feature.
 */
export function MatchTheater({
  round,
  participants,
  meWallet,
}: {
  round: RoundAccount;
  participants: ParticipantAccount[];
  meWallet?: string;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const founders = participants.filter((p) => p.side === "founder");
  const builders = participants.filter((p) => p.side === "builder");
  const frames = framesFor(round);
  const scrubbable = round.transparent && frames.length > 1;

  const [frame, setFrame] = useState(scrubbable && !reduce ? 0 : frames.length - 1);
  const [playing, setPlaying] = useState(scrubbable && !reduce);

  useEffect(() => {
    if (!playing || frame >= frames.length - 1) return;
    const id = setTimeout(() => setFrame((f) => f + 1), 1100);
    return () => clearTimeout(id);
  }, [playing, frame, frames.length]);

  useEffect(() => {
    setFrame(scrubbable && !reduce ? 0 : frames.length - 1);
    setPlaying(scrubbable && !reduce);
    // Restart whenever new frames land on chain.
  }, [round.historyLen, round.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const atEnd = frame >= frames.length - 1;
  const pairs = frames[Math.min(frame, frames.length - 1)] || [];

  const node = (p: ParticipantAccount) => ({
    label: p.handle,
    you: meWallet ? p.wallet.toBase58() === meWallet : false,
  });

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge/70 px-5 py-4">
        <Label>
          {round.transparent ? t.round.algorithm : t.round.result}
        </Label>

        {scrubbable && (
          <div className="flex items-center gap-3">
            <span className="tnum font-mono text-2xs text-muted">
              {t.stats.tick} {Math.min(frame + 1, round.tick)} / {round.tick}
            </span>
            <div className="flex items-center gap-1">
              <ControlButton
                label={atEnd ? t.round.replay : playing ? t.round.pause : t.round.play}
                onClick={() => {
                  if (atEnd) {
                    setFrame(0);
                    setPlaying(true);
                  } else {
                    setPlaying(!playing);
                  }
                }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={atEnd ? "replay" : playing ? "pause" : "play"}
                    initial={reduce ? undefined : { opacity: 0, scale: 0.7 }}
                    animate={reduce ? undefined : { opacity: 1, scale: 1 }}
                    exit={reduce ? undefined : { opacity: 0, scale: 0.7 }}
                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                    className="flex"
                  >
                    {atEnd ? (
                      <RotateCcw className="h-3.5 w-3.5" />
                    ) : playing ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </motion.span>
                </AnimatePresence>
              </ControlButton>
            </div>
          </div>
        )}
      </div>

      {scrubbable && (
        <div className="flex gap-1 px-5 pt-4" role="group" aria-label={t.stats.tick}>
          {frames.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setFrame(i);
                setPlaying(false);
              }}
              aria-label={`${t.round.goToTick} ${i + 1}`}
              aria-current={i === frame}
              className="group h-6 flex-1 cursor-pointer"
            >
              <span
                className={`block h-1 rounded-full transition-colors ${
                  i <= frame ? "bg-sealed" : "bg-edge group-hover:bg-edgeStrong"
                }`}
              />
            </button>
          ))}
        </div>
      )}

      <div className="px-2 py-5 sm:px-5">
        <MatchGraph
          left={founders.map(node)}
          right={builders.map(node)}
          pairs={pairs}
        />
      </div>

      <div className="space-y-3 border-t border-edge/70 px-5 py-4">
        <div className="flex items-center justify-between font-mono text-2xs text-muted">
          <span>{t.hero.proposers}</span>
          <span>{t.hero.receivers}</span>
        </div>

        {!round.transparent && (
          <Note>
            {t.round.notTransparent}
          </Note>
        )}

        <AnimatePresence>
          {round.status === "settled" && atEnd && (
            <motion.div
              initial={reduce ? undefined : { opacity: 0, y: 6 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Note>
                {t.round.settled}
              </Note>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Panel>
  );
}

function ControlButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      onClick={onClick}
      aria-label={label}
      title={label}
      whileHover={reduce ? undefined : { scale: 1.05 }}
      whileTap={reduce ? undefined : { scale: 0.94 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-edge text-muted transition-colors hover:border-edgeStrong hover:text-chalk"
    >
      {children}
    </motion.button>
  );
}
