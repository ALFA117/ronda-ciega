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
 * The rounds, with the empty ones folded away.
 *
 * Devnet keeps every round ever opened, and each run of the test suites
 * leaves behind a shell: one participant, no lists, never settled. There were
 * nineteen rounds here and most of them had nothing in them, so the first
 * thing a visitor met was debris.
 *
 * Folding, not filtering: the count is stated, one click opens them, and
 * nothing is removed. Hiding rounds outright on a page about verifiability
 * would be the wrong trade.
 */
export function RoundList({ rounds }: { rounds: RoundAccount[] }) {
  const t = useT();
  const reduce = useReducedMotion();
  const [showEmpty, setShowEmpty] = useState(false);

  const substantial = rounds.filter((r) => interest(r) > 0);
  const empty = rounds.filter((r) => interest(r) === 0);

  return (
    <>
      <div className="border-t border-edge">
        {substantial.map((r) => (
          <RoundRow key={r.address.toBase58()} round={r} />
        ))}
      </div>

      {empty.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowEmpty((v) => !v)}
            aria-expanded={showEmpty}
            className="glass flex h-11 cursor-pointer items-center gap-2 rounded-xl px-4 font-mono text-2xs text-muted transition-colors hover:text-chalk"
          >
            <motion.span
              animate={reduce ? undefined : { rotate: showEmpty ? 180 : 0 }}
              transition={springPanel}
              className="flex"
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </motion.span>
            {showEmpty
              ? t.rounds.hideEmpty
              : `${empty.length} ${t.rounds.emptyRounds}`}
          </button>

          <Collapse open={showEmpty}>
            <p className="pb-2 pt-4 text-xs leading-relaxed text-muted">
              {t.rounds.emptyNote}
            </p>
            <div className="border-t border-edge">
              {empty.map((r) => (
                <RoundRow key={r.address.toBase58()} round={r} />
              ))}
            </div>
          </Collapse>
        </div>
      )}
    </>
  );
}
