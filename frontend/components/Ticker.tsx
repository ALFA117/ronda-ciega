"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Lock } from "lucide-react";
import { RoundAccount } from "@/lib/program";
import { useParticipants } from "@/hooks/useParticipants";
import { useT } from "@/lib/i18n";

/**
 * The most recent settled round, one pairing at a time.
 *
 * Real names from a real round make the claim concrete in a way a diagram
 * cannot: these two people were matched, and neither list was ever published.
 * It cycles on its own, so the evidence arrives without being asked for.
 */
export function Ticker({ round }: { round: RoundAccount }) {
  const t = useT();
  const reduce = useReducedMotion();
  const { participants } = useParticipants(round.address.toBase58(), true, 0);
  const [i, setI] = useState(0);

  const founders = (participants ?? []).filter((p) => p.side === "founder");
  const builders = (participants ?? []).filter((p) => p.side === "builder");

  const pairs = founders
    .map((f) => ({ f, b: builders.find((x) => x.index === round.pairs[f.index]) }))
    .filter((p) => p.b);

  useEffect(() => {
    if (reduce || pairs.length < 2) return;
    const id = setInterval(() => setI((v) => (v + 1) % pairs.length), 2600);
    return () => clearInterval(id);
  }, [pairs.length, reduce]);

  if (!participants) {
    return (
      <div className="h-[52px] animate-pulse rounded-xl border border-edge bg-surface/30" />
    );
  }
  if (pairs.length === 0) return null;

  const current = pairs[Math.min(i, pairs.length - 1)];

  return (
    <Link
      href={`/round/${round.address.toBase58()}`}
      className="glass group flex items-center gap-3 rounded-xl px-4 py-3 transition-colors"
      aria-label={`${t.ticker.label} #${round.roundId.toString().slice(-6)}`}
    >
      <Lock className="h-3.5 w-3.5 shrink-0 text-sealed" aria-hidden />

      <span className="hidden shrink-0 font-mono text-2xs uppercase tracking-[0.16em] text-muted sm:inline">
        {t.ticker.label}
      </span>

      {/* Fixed height so the swap never nudges the layout. */}
      <div className="relative h-5 min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {/* Transform only. AnimatePresence skips the first entrance, so
              the opening pairing always showed — but every rotation after it
              started at opacity 0, and a tab that is not compositing never
              finishes the fade: the strip went permanently blank after the
              first swap. mode="wait" means the outgoing row is gone before the
              next arrives, so nothing is lost by dropping the fade. */}
          <motion.div
            key={current.f.address.toBase58()}
            initial={reduce ? undefined : { y: 14 }}
            animate={reduce ? undefined : { y: 0 }}
            exit={reduce ? undefined : { y: -14 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 flex items-center gap-2 font-mono text-sm"
          >
            <span className="truncate text-chalk">{current.f.handle}</span>
            <span className="shrink-0 text-sealed" aria-hidden>
              ───
            </span>
            <span className="truncate text-chalk">{current.b!.handle}</span>
          </motion.div>
        </AnimatePresence>
      </div>

      <span className="tnum hidden shrink-0 font-mono text-2xs text-muted sm:inline">
        {i + 1}/{pairs.length}
      </span>

      <ArrowUpRight
        className="h-3.5 w-3.5 shrink-0 text-muted transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-sealed"
        aria-hidden
      />
    </Link>
  );
}
