"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { interest } from "@/lib/rounds";
import type { RoundAccount } from "@/lib/program";
import { useT } from "@/lib/i18n";
import { springPanel } from "@/lib/motion";
import { Collapse } from "./Collapse";
import { RoundRow } from "./RoundRow";

/**
 * The rounds, with everything past the first few folded away.
 *
 * Devnet keeps every round ever opened and every test run leaves one behind,
 * so this list only grows: it was 2484 pixels of the page, twenty-nine per
 * cent of the whole thing, sitting at the bottom where nobody scrolls to it.
 * A listing that gets worse every time the suites run is a listing that will
 * be at its worst on the day it matters.
 *
 * Folding, not filtering: the count is stated, one click opens the rest, and
 * nothing is removed. Hiding rounds outright on a page about verifiability
 * would be the wrong trade.
 */

/**
 * How many rounds lead the list.
 *
 * Six is two rows of three at the widths where the grid is three across, and
 * enough to show the shape of what is here — an open round or two, then the
 * settled ones — without turning the section into the page.
 */
const LEAD = 6;

export function RoundList({ rounds }: { rounds: RoundAccount[] }) {
  const t = useT();
  const reduce = useReducedMotion();
  const [showRest, setShowRest] = useState(false);

  const substantial = rounds.filter((r) => interest(r) > 0);
  const empty = rounds.filter((r) => interest(r) === 0);

  const lead = substantial.slice(0, LEAD);
  // The remainder and the shells fold together behind one control. Two
  // disclosures stacked under a list is more furniture than the content
  // deserves, and the empty ones keep their own explanation inside.
  const rest = substantial.slice(LEAD);
  const hidden = rest.length + empty.length;

  return (
    <>
      <div className="border-t border-edge">
        {lead.map((r) => (
          <RoundRow key={r.address.toBase58()} round={r} />
        ))}
      </div>

      {hidden > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowRest((v) => !v)}
            aria-expanded={showRest}
            className="glass flex h-11 cursor-pointer items-center gap-2 rounded-xl px-4 font-mono text-2xs text-muted transition-colors hover:text-chalk"
          >
            <motion.span
              animate={reduce ? undefined : { rotate: showRest ? 180 : 0 }}
              transition={springPanel}
              className="flex"
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </motion.span>
            {showRest ? t.rounds.hideEmpty : `${hidden} ${t.rounds.moreRounds}`}
          </button>

          <Collapse open={showRest}>
            {rest.length > 0 && (
              <div className="mt-4 border-t border-edge">
                {rest.map((r) => (
                  <RoundRow key={r.address.toBase58()} round={r} />
                ))}
              </div>
            )}

            {empty.length > 0 && (
              <>
                <p className="pb-2 pt-4 text-xs leading-relaxed text-muted">
                  {t.rounds.emptyNote}
                </p>
                <div className="border-t border-edge">
                  {empty.map((r) => (
                    <RoundRow key={r.address.toBase58()} round={r} />
                  ))}
                </div>
              </>
            )}
          </Collapse>
        </div>
      )}
    </>
  );
}
