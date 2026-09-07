"use client";

import { RefObject, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { NONE } from "@/lib/constants";
import { ParticipantAccount, RoundAccount } from "@/lib/program";
import { useT } from "@/lib/i18n";
import { springPanel } from "@/lib/motion";
import { StatusPill } from "./ui";

/**
 * A thin bar that takes over once the round's header scrolls away.
 *
 * Scrolling down a round page used to lose the two things you need to hold in
 * your head — which round this is and how it came out. This keeps both in
 * view, so checking costs no scrolling back.
 *
 * Visibility is measured on a poll as well as on scroll: a page that is not
 * being painted dispatches no scroll events at all, and a summary that
 * silently stops updating is worse than none.
 */
export function StickySummary({
  round,
  participants,
  anchor,
}: {
  round: RoundAccount;
  participants: ParticipantAccount[];
  /** The header this bar replaces. */
  anchor: RefObject<HTMLElement>;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const check = () => {
      const el = anchor.current;
      if (!el) return;
      setShow(el.getBoundingClientRect().bottom < 72);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    const id = window.setInterval(check, 400);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      window.clearInterval(id);
    };
  }, [anchor]);

  const founders = participants.filter((p) => p.side === "founder");
  const builders = participants.filter((p) => p.side === "builder");
  const matched = round.pairs
    .slice(0, round.founderCount)
    .filter((b) => b !== NONE).length;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={reduce ? undefined : { y: -12 }}
          animate={reduce ? undefined : { y: 0 }}
          exit={reduce ? undefined : { y: -12 }}
          transition={springPanel}
          className="sticky top-[78px] z-30 mb-6"
        >
          <div className="glass flex items-center gap-3 rounded-2xl px-3 py-2.5 sm:px-4">
            <span className="tnum shrink-0 font-mono text-2xs">
              #{round.roundId.toString().slice(-6)}
            </span>
            <StatusPill status={round.status} />

            {/* The pairing as a strip: one tick per founder, lit when paired. */}
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden font-mono text-2xs text-muted sm:inline">
                {matched}/{round.founderCount} {t.stats.matched}
              </span>
              <div className="flex items-end gap-[3px]" aria-hidden>
                {founders.map((f) => {
                  const paired = round.pairs[f.index] !== NONE;
                  return (
                    <motion.span
                      key={f.address.toBase58()}
                      layout
                      className={`w-[3px] rounded-full ${
                        paired ? "h-4 bg-sealed" : "h-2 bg-edgeStrong"
                      }`}
                    />
                  );
                })}
              </div>
              <span className="font-mono text-2xs text-muted">
                {builders.length}
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
