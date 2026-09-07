"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Pause, Play, RotateCcw } from "lucide-react";
import { framesFor, ParticipantAccount, RoundAccount } from "@/lib/program";
import { useT } from "@/lib/i18n";
import { MatchGraph } from "./MatchGraph";
import { IconButton, Label, Note, Panel } from "./ui";

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

  /**
   * What round a frame belongs to.
   *
   * Frame i is the state after proposal round i+1, except the last one. The
   * algorithm keeps going until a round makes no proposals, and that final
   * round changes nothing, so it is never recorded — which means the last
   * frame is the state the round ended on, whatever number the chain says that
   * round was. The counter and the jump buttons both ask this, because two
   * places numbering the same thing differently is how a control comes to say
   * "go to round 2" and land you on round 3.
   */
  const roundOf = (i: number) =>
    i >= frames.length - 1 ? round.tick : Math.min(i + 1, round.tick);
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
              {t.stats.tick} {roundOf(frame)} / {round.tick}
            </span>
            <div className="flex items-center gap-1">
              <IconButton
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
                    initial={reduce ? undefined : { scale: 0.7 }}
                    animate={reduce ? undefined : { scale: 1 }}
                    exit={reduce ? undefined : { scale: 0.7 }}
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
              </IconButton>
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
              aria-label={`${t.round.goToTick} ${roundOf(i)}`}
              aria-current={i === frame}
              className="group h-11 flex-1 cursor-pointer sm:h-8"
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

      {/* Swipe to step through the rounds. Constrained with elastic
          overshoot rather than free drag: unconstrained drag on a page reads
          as broken, and the elastic tells the finger it reached the end. */}
      <motion.div
        className="touch-pan-y px-2 py-5 sm:px-5"
        drag={scrubbable ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.14}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (!scrubbable) return;
          const threshold = 56;
          if (info.offset.x < -threshold) {
            setPlaying(false);
            setFrame((f) => Math.min(f + 1, frames.length - 1));
          } else if (info.offset.x > threshold) {
            setPlaying(false);
            setFrame((f) => Math.max(f - 1, 0));
          }
        }}
      >
        <MatchGraph
          left={founders.map(node)}
          right={builders.map(node)}
          pairs={pairs}
        />

        {scrubbable && (
          <p className="mt-4 text-center font-mono text-[10px] text-muted sm:hidden">
            {t.round.swipeHint}
          </p>
        )}
      </motion.div>

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
              initial={reduce ? undefined : { y: 6 }}
              animate={reduce ? undefined : { y: 0 }}
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
